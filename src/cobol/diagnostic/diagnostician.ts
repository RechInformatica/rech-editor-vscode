"use babel";
import { TextDocument, Diagnostic } from "vscode-languageserver";
import { CobolDiagnostic } from "./cobolDiagnostic";
import { Path } from "../../commons/path";
import { File } from "../../commons/file";
import { CobolDiagnosticParser } from "./cobolDiagnosticParser";
import { CobolDiagnosticPreprocManager } from "./CobolDiagnosticPreprocManager";

/** Root directory from diagnostic files */
const DIAGNOSTIC_ROOT_DIR = "C:\\TMP\\Diagnostic\\";


/**
 * Class to diagnose sources
 */
export class Diagnostician {

  /** Lines of the source */
  private sourceLines: string;

  constructor(sourceLines: string) {
    this.sourceLines = sourceLines;
  }

  /**
   * Diagnoses the source
   *
   * @param textDocument
   * @param preprocessorResultFileName
   * @param PreprocessCallback
   */
  public diagnose(textDocument: TextDocument,
    PreprocessCallback: (uri: string) => Thenable<string>,
    externalGetCopyHierarchy: (uri: string) => Thenable<string>,
    externalDiagnosticFilter?: (diagnosticMessage: string) => Thenable<boolean>,
    isDeprecatedWarning?: (diagnosticMessage: string) => Thenable<boolean>
  ): Promise<Diagnostic[]> {
    return new Promise((resolve, reject) => {
      this.findErrorsAndWarnings(textDocument, PreprocessCallback, externalGetCopyHierarchy, externalDiagnosticFilter, isDeprecatedWarning).then(cobolDiagnostic => {
          if (!cobolDiagnostic) {
            return reject();
          }
          this.extractDiagnostics(cobolDiagnostic).then(diagnostics => {
            return resolve(diagnostics);
          }).catch(() => {
            return reject();
          });
        }).catch(() => {
          return reject();
        });
    });
  }

  /**
   * Find errors or/and warnings
   *
   * @param textDocument
   * @param preprocessorResultFileName
   * @param PreprocessCallback
   */
  private findErrorsAndWarnings(
    textDocument: TextDocument,
    PreprocessCallback: (uri: string) => Thenable<string>,
    externalGetCopyHierarchy: (uri: string) => Thenable<string>,
    externalDiagnosticFilter?: (diagnosticMessage: string) => Thenable<boolean>,
    isDeprecatedWarning?: (diagnosticMessage: string) => Thenable<boolean>
  ): Promise<CobolDiagnostic | undefined> {
    return new Promise<CobolDiagnostic>((resolve, reject) => {
      // If not a cobol processable source
      const documentPath = new Path(textDocument.uri);
      if (documentPath.extension().toUpperCase() != ".CBL" || documentPath.extension().toUpperCase() != ".COB") {
        return reject();
      }
      const dir = new File(DIAGNOSTIC_ROOT_DIR + require("os").userInfo().username + "\\");
      if (!dir.exists()) {
        dir.mkdir();
      }
      const tmpFile = new File(
        dir.fileName + documentPath.fileName()
      );
      CobolDiagnosticPreprocManager.runWhenPossible(
        PreprocessCallback,
        tmpFile,
        Buffer.from(textDocument.getText()),
        (buffer) => {
          const fileName = documentPath.fullPath();
          new CobolDiagnosticParser(this.sourceLines)
            .parser(buffer, fileName, externalGetCopyHierarchy, externalDiagnosticFilter, isDeprecatedWarning)
            .then(cobolDiagnostic => {
              return resolve(cobolDiagnostic);
            })
            .catch(() => {
              return reject();
            });
        },
        () => {return reject()}
      );
    });
  }

  /**
   * Returns an array containing the diagnostics
   *
   * @param cobolDiagnostic
   */
  private extractDiagnostics(cobolDiagnostic: CobolDiagnostic): Promise<Diagnostic[]> {
    return new Promise((resolve, reject) => {
      const diagnostics: Diagnostic[] = [];
      cobolDiagnostic.errors.forEach(diagnostic => {
        diagnostics.push(diagnostic);
      });
      cobolDiagnostic.warnings.forEach(diagnostic => {
        diagnostics.push(diagnostic);
      });
      if (diagnostics) {
        return resolve(diagnostics);
      } else {
        return reject()
      }
    });
  }
}
