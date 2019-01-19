import { CobolWordFinder } from "../../commons/CobolWordFinder";

/** Maximum number of interpreted lines */
const MAX_INTERPRETED_LINES = 100;

/**
 * Utili class for Cobol code completion and formatting
 */
export class CompletionUtils {
  /**
   * Returns the number of spaces in the beginning of the specified string
   *
   * @param lineText line text
   */
  public static countSpacesAtBeginning(lineText: string) {

    //return lineText.length - lineText.trimLeft().length
    for (let index = 0; index < lineText.length; index++) {
      if (lineText.charAt(index) !== " ") {
        return index;
      }
    }
    return lineText.length;
  }

  /**
   * Fills missing spaces between the current cursor column and the target final
   * column.
   *
   * Example:
   * CompletionUtils.fillMissingSpaces(10, 5) -> generates "    " (four spaces)
   * CompletionUtils.fillMissingSpaces(5, 1) -> generates "   " (three spaces)
   *
   * If the cursor column is equal or greater than the target final column, a single
   * space is added so the completion will not be attached to previous text in the line.
   *
   * Example:
   * CompletionUtils.fillMissingSpaces(10, 10) -> generates " " (single space)
   * CompletionUtils.fillMissingSpaces(10, 12) -> generates " " (single space)
   *
   * @param targetFinalColumn final column until where spaces should be inserted
   * @param currentCursorColumn column where cursor is currently positioned
   * @param currentLineText current line text
   * @deprecated fillExactMissingSpaces should be used instead
   */
  public static fillMissingSpaces(targetFinalColumn: number, currentCursorColumn: number, currentLineText?: string): string {
    let missingSpaces = targetFinalColumn - currentCursorColumn;
    let text = "";
    for (var i = 1; i < missingSpaces; i++) {
      text = text.concat(" ");
    }
    if (text.length === 0) {
      if (currentLineText) {
        let lastChar = currentLineText.charAt(currentCursorColumn - 1);
        if (lastChar !== " ") {
          text = " ";
        }
      } else {
        text = " ";
      }
    }
    return text;
  }

  /**
   * Fills the exact number of missing spaces between the current cursor column and the target final
   * column.
   *
   * @param targetFinalColumn final column until where spaces should be inserted
   * @param currentCursorColumn column where cursor is currently positioned
   * @param currentLineText text of current line
   */
  public static fillExactMissingSpaces(targetFinalColumn: number, currentCursorColumn: number, currentLineText: string): string {
    let initialWordColumn = CompletionUtils.findWordStartWithinLine(currentCursorColumn, currentLineText);
    let missingSpaces = targetFinalColumn - initialWordColumn;
    let text = "";
    for (var i = 0; i < missingSpaces; i++) {
      text = text.concat(" ");
    }
    return text;
  }

  /**
   * Returns the column where the current word starts within the line
   * 
   * @param currentCursorColumn current column where cursor is positioned
   * @param currentLineText current line text
   */
  public static findWordStartWithinLine(currentCursorColumn: number, currentLineText: string): number {
    let initialWordColumn = currentCursorColumn;
    while(true) {
        if (initialWordColumn == 0) {
          break;
        }
        let lastChar = currentLineText.charAt(initialWordColumn - 1);
        if (lastChar === " ") {
            break;
        }
        initialWordColumn--;
    }
    initialWordColumn++;
    return initialWordColumn;
}

  /**
   * Returns the Cobol command separator for the specified column
   *
   * @param column target column
   */
  public static separatorForColumn(column: number): string {
    if (column <= 12) {
      return ".";
    }
    return ",";
  }

  /**
   * Returns {@code true} if the source is lower case
   *
   * @param sourceBuffer
   */
  public static isLowerCaseSource(sourceBuffer: string[]) {
    for (let i = 0; i < sourceBuffer.length && i < MAX_INTERPRETED_LINES; i++) {
      // Dismiss comments
      if (sourceBuffer[i].trim().startsWith("*>")) {
        continue;
      }
      // Test header clauses
      if (/\s+(identification|program-id|copy|working-storage|procedure)(\s|.|,)/g.exec(sourceBuffer[i])) {
        return true;
      }
      // Test procedure clauses
      if (/\s+(perform|exit|evaluate|move)(\s|.|,)/g.exec(sourceBuffer[i])) {
        return true;
      }
      // Test working-storage clauses
      if (/.*\s(pic|value|values|class)(\s|.|,)/g.exec(sourceBuffer[i])) {
        return true;
      }
    }
    return false;
  }

  /**
   * Returns the number of the first character on the specified line
   */
  public static getFirstCharacterColumn(lineText: string): number {
    for (let i = 0; i < lineText.length; i++) {
      if (lineText.charAt(i) !== " ") {
        return i;
      }
    }
    return 0;
  }

  /**
   * Returns true if the lineText is the paragraph declaration
   *
   * @param lineText
   */
  public static isTheParagraphDeclaration(lineText: string): boolean {
    if (/^\s{7}[\w\-\(\)\@\#]+\.(?!.*[a-zA-Z])/g.exec(lineText)) {
      return true;
    }
    return false;
  }

}
