"use babel";
import { Diagnostic, DiagnosticSeverity, Range, Position } from "vscode-languageserver";
import { CobolDiagnostic } from "./cobolDiagnostic";
import { File } from "../../commons/file";
import { Path } from "../../commons/path";
import { Scan, BufferSplitter } from "rech-ts-commons";
import Q from "q";
import { CompletionUtils } from "../../lsp/commons/CompletionUtils";

/**
 * Class conteiner of diagnostcs of cobol language
 */
export class CobolDiagnosticParser {

  /** Lines of the source */
  private sourceLines: string;
  /** Splitted lines of source code */
  private splittedSource: string[] | undefined;
  /** Lines of the source */
  private static copyHierarchy: Map<string, string> = new Map();

  constructor(sourceLines: string) {
    this.sourceLines = sourceLines;
  }

  /**
   * Parses the preprocessor results
   *
   * @param preprocResult
   * @param fileName
   */
  parser(preprocResult: string, fileName: string, externalGetCopyHierarchy: (uri: string) => Thenable<string>, externalDiagnosticFilter?: (diagnosticMessage: string) => Thenable<boolean>): Promise<CobolDiagnostic> {
    return new Promise((resolve, reject) => {
      if (CobolDiagnosticParser.copyHierarchy.get(fileName)) {
        this.extractDiagnostic(preprocResult, fileName, externalDiagnosticFilter).then((result) => {
          return resolve(result);
        }).catch(() => {
          return reject();
        })
      } else {
        externalGetCopyHierarchy(fileName).then((resultCopyHierarchy) => {
          CobolDiagnosticParser.copyHierarchy.set(fileName, resultCopyHierarchy);
          this.extractDiagnostic(preprocResult, fileName, externalDiagnosticFilter).then((result) => {
            return resolve(result);
          }).catch(() => {
            return reject();
          })
        });
      }
    })
  }

  /**
   * Extract the diagnostic in the result of preproc
   *
   * @param preprocResult
   * @param fileName
   */
  private extractDiagnostic(preprocResult: string, fileName: string, externalDiagnosticFilter?: (diagnosticMessage: string) => Thenable<boolean>): Promise<CobolDiagnostic> {
    return new Promise((resolve, reject) => {
      const interpreters: Array<Promise<Diagnostic>> = [];
      const lines = BufferSplitter.split(preprocResult);
      const pattern = /\*\*\*\sWarning:\s(.*);\sfile\s=\s([A-Za-z0-9.]+),\sline\s=\s(\d+)\s?(\(Erro\))?/;
      lines.forEach(currentLine => {
        interpreters.push(this.interpretsTheErrorMessage(fileName, pattern, currentLine, externalDiagnosticFilter));
      });
      Q.allSettled(interpreters).then((results) => {
        const diagnostics: Diagnostic[] = [];
        results.forEach((result) => {
          if (result.state === "fulfilled") {
            diagnostics.push(result.value!);
          }
        });
        return resolve(this.buildCobolDiagnostic(diagnostics));
      }).catch(() => {
        return reject();
      })
    });
  }

  /**
   * Returns a CobolDiagnostic with diagnostics found
   *
   * @param diagnostics
   */
  private buildCobolDiagnostic(diagnostics: Diagnostic[]): CobolDiagnostic {
    const errors: Diagnostic[] = [];
    const warnings: Diagnostic[] = [];
    diagnostics.forEach((diagnostic) => {
      if (diagnostic) {
        if (diagnostic.severity == DiagnosticSeverity.Error) {
          errors.push(diagnostic);
        } else {
          warnings.push(diagnostic);
        }
      }
    });
    return new CobolDiagnostic(errors, warnings);
  }

  /**
   * Interpret the error message and insert the diagnostic
   *
   * @param fileName
   * @param pattern
   * @param currentLine
   * @param externalDiagnosticFilter
   */
  private interpretsTheErrorMessage(fileName: string, pattern: RegExp, currentLine: string, externalDiagnosticFilter?: (diagnosticMessage: string) => Thenable<boolean>): Promise<Diagnostic> {
    return new Promise((resolve, reject) => {
      const match = pattern.exec(currentLine);
      if (!match) {
        return reject();
      }
      let fullError, message: any, file: any, line: any, error: any;
      [fullError, message, file, line, error] = match;
      if (externalDiagnosticFilter) {
        externalDiagnosticFilter(message).then((result) => {
          if (result) {
            return resolve(this.buildDiagnosticOfError(fileName, message, file, line, error));
          } else {
            return resolve();
          }
        });
      } else {
        return resolve(this.buildDiagnosticOfError(fileName, message, file, line, error));
      }
    });
  }

  /**
   * Build the diagnostic of error and insert the result in the {@code errors} or {@code warnings} array
   *
   * @param fileName
   * @param message
   * @param file
   * @param line
   * @param error
   */
  private buildDiagnosticOfError(fileName: string, message: string, file: string, line: string, error: boolean): Diagnostic {
    const nLine = Number.parseInt(line) - 1;
    const diagnosticSeverity = this.getAppropriateSeverity(error);
    return this.createDiagnostic(
      fileName,
      diagnosticSeverity,
      Range.create(
        Position.create(nLine, 0),
        Position.create(nLine, 120),
      ),
      message,
      file
    )
  }

  /**
   * Returns the appropriate Diagnostic Severity according do diagnostic classification (if it's an error or not)
   *
   * @param error indicates wheter the diagnostic represents an error
   */
  private getAppropriateSeverity(error: boolean): DiagnosticSeverity {
    if (error) {
      return DiagnosticSeverity.Error;
    }
    return DiagnosticSeverity.Warning;
  }

  /**
   * Create a diagnostic
   *
   * @param fileName
   * @param severity
   * @param range
   * @param message
   * @param source
   */
  private createDiagnostic(fileName: string, severity: DiagnosticSeverity, range: Range, message: string, source: string): Diagnostic {
    const diagnosticRange = this.createAppropriateDiagnosticRange(fileName, source, range);
    const fullFileName = this.fullFileName(new Path(fileName).fullPathWin(), source);
    const diagnosticId = this.extractDiagnosticIdentifier(message);
    const diagnostic: Diagnostic = {
      severity: severity,
      code: diagnosticId,
      range: {
        start: {
          line: diagnosticRange.start.line,
          character: diagnosticRange.start.character
        },
        end: {
          line: diagnosticRange.end.line,
          character: diagnosticRange.end.character
        }
      },
      message: message,
      source: fullFileName,
      relatedInformation: [
        {
          location: {
            uri: new Path(fullFileName).fullPathVscode(),
            range: Object.assign({}, {
              start: {
                line: range.start.line,
                character: range.start.character
              },
              end: {
                line: range.end.line,
                character: range.end.character
              }
            })
          },
          message: message
        },
      ]
    };
    return diagnostic;
  }

  /**
   * Creates a range on the best line according to diagnostic source code.
   *
   * If the diagnostic points to a copybook file, then the best line is the copybook
   * declaration within the current source code.
   *
   * The start position is the first character on the line which is different of 'space' to
   * make a better rendering.
   *
   * @param fileName file which diagnostic points to
   * @param source current source code name
   * @param range current range
   */
  private createAppropriateDiagnosticRange(fileName: string, source: string, range: Range): Range {
    const rangeOnBestLine = this.createRangeOnBestLine(fileName, source, range);
    const beginningOfLine = CompletionUtils.countSpacesAtBeginning(this.getSplittedSource()[rangeOnBestLine.start.line]);
    return Range.create(
      Position.create(rangeOnBestLine.start.line, beginningOfLine),
      Position.create(rangeOnBestLine.end.line, rangeOnBestLine.end.character),
    );
  }

  /**
   * Creates a range on the best line according to diagnostic source code.
   *
   * If the diagnostic points to a copybook file, then the best line is the copybook
   * declaration within the current source code.
   *
   * @param fileName file which diagnostic points to
   * @param source current source code name
   * @param range current range
   */
  private createRangeOnBestLine(fileName: string, source: string, range: Range): Range {
    if (new Path(fileName).fileName() == source) {
      return range;
    }
    const rangeOfCopyDeclaration = this.createRangeOfCopyDeclaration(fileName, source);
    if (rangeOfCopyDeclaration) {
      return rangeOfCopyDeclaration;
    }
    const lastLineRange = this.createDummyRangeOnLastLine();
    return lastLineRange;
  }

  /**
   * Creates a diagnostic on copy declaration position
   *
   * @param fileName file name
   * @param source source name
   */
  private createRangeOfCopyDeclaration(fileName: string, source: string): Range | undefined {
    let result: Range | undefined = undefined;
    const regexp = new RegExp(".*" + this.copyDeclaredInSource(fileName, source).replace(".", "\\.") + ".*", "gmi");
    new Scan(this.sourceLines).scan(regexp, (iterator: any) => {
      result = {
        start: {
          line: iterator.row,
          character: 0
        },
        end: {
          line: iterator.row,
          character: 120
        }
      }
      iterator.stop();
    });
    return result;
  }

  /**
   * Creates a dummy range on the last line of the source code.
   * It is used when, somehow, the diagnostic returned an invalid line which does not exist on current source code.
   *
   * Then, to prevent erros, the diagnostic range is set to the last line of current source code.'
   */
  private createDummyRangeOnLastLine(): Range {
    const length = this.getSplittedSource().length;
    return {
      start: {
        line: length,
        character: 0
      },
      end: {
        line: length,
        character: 120
      }
    };
  }

  /**
   * Extracts and returns the diagnostic unique identifier from it's message
   *
   * @param message diagnostic message
   */
  private extractDiagnosticIdentifier(message: string): string | undefined {
    const diagnosticId = /\[(W...)].*/.exec(message);
    if (diagnosticId && diagnosticId.length > 1) {
      return diagnosticId[1];
    }
    return undefined;
  }

  /**
   * Returns the declared copy in current source containing the errors
   *
   * @param source
   */
  private copyDeclaredInSource(fileName: string, source: string): string {
    const copys = CobolDiagnosticParser.copyHierarchy.get(fileName);
    let copyArray;
    if (copys) {
      copyArray = copys.split("\n");
    } else {
      return "Copy not found";
    }
    let copyFounded = false;
    for (let i = copyArray.length; i > 0; i--) {
      const copy = copyArray[i];
      if (!copyFounded && copy && copy.includes(source)) {
        copyFounded = true;
      }
      if (copyFounded) {
        if (copy == copy.trimLeft()) {
          const match = /(.*\.(?:cpy|cpb))/.exec(copy.trim());
          const copyName = match ? match[1] : "";
          return new Path(copyName).fileName();
        }
      }
    }
    return "Copy not found";
  }

  /**
   * Returns the full file name
   *
   * @param fileName
   * @param source
   */
  private fullFileName(fileName: string, source: string): string {
    const file = new File(new Path(fileName).directory() + source);
    if (file.exists()) {
      return file.fileName;
    } else {
      return "F:\\Fontes\\" + source;
    }
  }

  /**
   * Remove the source from the copy cache
   *
   * @param source
   */
  public static removeSourceFromCopyCache(source: string) {
    CobolDiagnosticParser.copyHierarchy.delete(source);
  }

  /**
   * Returns the source code splitted into an array
   */
  private getSplittedSource(): string[] {
    if (!this.splittedSource) {
      this.splittedSource = BufferSplitter.split(this.sourceLines);
    }
    return this.splittedSource;
  }

}
