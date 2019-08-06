import { Range, TextEditor, DecorationRenderOptions, window, TextEditorDecorationType, Position } from "vscode";
import { CobolVariable } from "../lsp/completion/CobolVariable";
import { VariableUtils } from "../commons/VariableUtils";
import { Scan } from "../commons/Scan";
import { Configuration } from "../helpers/configuration";
import Q from "q";

export class Parser {
  private static lastLocalVariableDecorator: TextEditorDecorationType
  private static lastRechDocTypeDecorator: TextEditorDecorationType
  private static lastRechDocVariableDecorator: TextEditorDecorationType
  private rechDocTypeRangeList: Range[] = [];
  private rechDocVariableRangeList: Range[] = [];
  private localVariableRangeList: Range[] = [];

  /**
   * Find all local variables
   *
   * @param activeEditor
   */
  public findLocalVariables(activeEditor: TextEditor): Promise<undefined> {
    return new Promise((resolve, reject) => {
      const text = activeEditor.document.getText();
      if (!this.needDifferentiateVariablesByScope(text)) {
        return resolve();
      }
      Q.all(this.getAllLocalVariables(text)).then(() => {
        return resolve();
      }).catch(() => {
        return reject();
      })
    });
  }

  /**
   * Returns all variables and your uses in a promise array
   *
   * @param activeEditor
   * @param text
   */
  private getAllLocalVariables(text: string): Promise<undefined>[] {
    const PromiseArray:Promise<undefined>[] = []
    // Regexp to find variables declarations in source
    const regex = /^\s+\d\d\s+(?:[\w\-]+)?(?:\(.*\))?([\w\-]+)(\s+|\.).*/gm
    new Scan(text).scan(regex, (iterator: any) => {
      PromiseArray.push(
        new Promise((resolve, reject) => {
          const variable = CobolVariable.parseLines(iterator.row, text.split("\n"), {noChildren: true, noSection: true, ignoreMethodReturn: true, noComment: true});
          if (VariableUtils.isLocalScope(variable)) {
            this.getUsesFromVariable(text, variable).then((usesFromVariable) => {
              Q.all(usesFromVariable).then(() => {
                return resolve();
              }).catch(() => {
                return reject();
              })
            }).catch(() => {
              return reject();
            })
            return resolve();
          } else {
            return resolve();
          }
        })
      );
    });
    return PromiseArray;
  }

  /**
   * Returns all uses from variables in a promise array
   *
   * @param activeEditor
   * @param text
   * @param variable
   */
  private getUsesFromVariable(text: string, variable: CobolVariable): Promise<Promise<undefined>[]> {
    return new Promise((resolve, reject) => {
      const PromiseArray:Promise<undefined>[] = []
      const variableDeclarationPosition = variable.getDeclarationPosition()
      if (!variableDeclarationPosition) {
        return reject();
      }
      let shortText = text.split("\n").slice(variableDeclarationPosition.line).join("\n")
      const variableUseRegex = new RegExp(`[\\s\\.\\,\\:\\)\\(](${variable.getName()})[\\s\\t\\n\\r\\.\\,\\:\\)\\(]`, "img")
      const endMethodRegex = new RegExp(`(\\s+end\\s+method\\.)`, "img")
      const endMethodLine = endMethodRegex.exec(shortText)
      if (!endMethodLine) {
        return reject();
      }
      shortText = shortText.substr(0, endMethodLine.index + endMethodLine[1].length)
      new Scan(shortText).scan(variableUseRegex, (iterator: any) => {
        PromiseArray.push(
          new Promise((resolve, _reject) => {
            const startLine = iterator.row;
            const startCharacter = iterator.column;
            let startPos = new Position(startLine, startCharacter);
            // If the line is a commentary, dont decore
            if (!shortText.split("\n")[startPos.line].trim().startsWith("*>")) {
              const endLine = iterator.row;
              const endCharacter = iterator.column;
              let endPos = new Position(endLine, endCharacter + variable.getName().length + 1);
              // Adjust the start/end line and add the range in list to decorate
              startPos = new Position(startPos.line + variableDeclarationPosition.line, startPos.character + 1)
              endPos = new Position(endPos.line + variableDeclarationPosition.line, endPos.character)
              this.localVariableRangeList.push(new Range(startPos, endPos));
            }
            return resolve();
          })
        );
      });
      return resolve(PromiseArray);
    });
  }

  /**
   * Return if text represents a OO cobol source with methods
   *
   * @param text
   */
  private needDifferentiateVariablesByScope(text: string): boolean {
    return /^\s+method-id\./gmi.test(text);
  }

	/**
	 * Finds documentation comment blocks with Rech documentation starting with "*> @"
	 * @param activeEditor The active text editor containing the code document
	 */
  public findRechDocComments(activeEditor: TextEditor): Promise<undefined> {
    return new Promise((resolve, _reject) => {
      const text = activeEditor.document.getText();
      // Regex to search documentation comment blocks between "*>/**   *>*/"
      const blockCommentRegEx = /(^|[ \t])(\*\>\/\*\*)+([\s\S]*?)(\*\/)/igm;
      // Regex to find parameter lines inside a documentation block
      const lineParameterRegEx = new RegExp(/([ \t]*\*>[ \t]*)(@param|@enum|@return|@throws|@optional|@default|@extends)([ ]*|[:])+([a-zA-Z0-9_\-(?)]*) *([^*/][^\r\n]*)/, "ig");
      // Find all documentation comment blocks on text
      let match: any;
      while (match = blockCommentRegEx.exec(text)) {
        const commentBlock = match[0];
        // Find all parameter lines inside a block
        let line;
        while (line = lineParameterRegEx.exec(commentBlock)) {
          // Range of parameter description type
          let startPos = activeEditor.document.positionAt(match.index + line.index + line[1].length);
          let endPos = activeEditor.document.positionAt(match.index + line.index + line[1].length + line[2].length);
          // Add the range in list to decorate
          this.rechDocTypeRangeList.push(new Range(startPos, endPos));
          // If documentation line have variable after type
          if (line[4].length != 0) {
            // Range of parameter variable
            startPos = activeEditor.document.positionAt(match.index + line.index + line[1].length + line[2].length + line[3].length);
            endPos = activeEditor.document.positionAt(match.index + line.index + line[1].length + line[2].length + line[3].length + line[4].length);
            // Add the range in list to decorate
            this.rechDocVariableRangeList.push(new Range(startPos, endPos));
          }
        }
      }
      return resolve();
    });
  }

	/**
	 * Applies decorations previously found
	 * @param activeEditor The active text editor containing the code document
	 */
  public applyDecorations(activeEditor: TextEditor): void {
    const colors = new Configuration("rech.editor.cobol").get<any>("especialColors");
    // Create decorator to RechDoc type of documentation and aply on Ranges
    let color: DecorationRenderOptions = { color: colors.rechdocToken, backgroundColor: "transparent" };
    let decorator = window.createTextEditorDecorationType(color);
    activeEditor.setDecorations(decorator, this.rechDocTypeRangeList);
    if (Parser.lastRechDocTypeDecorator) {
      Parser.lastRechDocTypeDecorator.dispose()
    }
    Parser.lastRechDocTypeDecorator = decorator;
    this.rechDocTypeRangeList.length = 0;
    // Create decorator to RechDoc variable documentation and aply on Ranges
    color = { color: colors.rechdocVariable, backgroundColor: "transparent" };
    decorator = window.createTextEditorDecorationType(color);
    activeEditor.setDecorations(decorator, this.rechDocVariableRangeList);
    if (Parser.lastRechDocVariableDecorator) {
      Parser.lastRechDocVariableDecorator.dispose()
    }
    Parser.lastRechDocVariableDecorator = decorator;
    this.rechDocVariableRangeList.length = 0;
    // Create decorator to local variable and aply on Ranges
    color = { color: colors.localScopeVariable, backgroundColor: "transparent" };
    decorator = window.createTextEditorDecorationType(color);
    activeEditor.setDecorations(decorator, this.localVariableRangeList);
    if (Parser.lastLocalVariableDecorator) {
      Parser.lastLocalVariableDecorator.dispose()
    }
    Parser.lastLocalVariableDecorator = decorator;
    this.localVariableRangeList.length = 0;
  }

}