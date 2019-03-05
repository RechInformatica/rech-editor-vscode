'use babel';

export class ParserCobol {

  /**
   * Returns if line is the element declaration
   *
   * @param element
   * @param line
   */
  public isDeclaration(element: string, line: string): boolean {
    if (this.isCommentOrEmptyLine(line)) {
      return false;
    }
    if (this.equalsIgnoreReplacing(element, this.getDeclaracaoParagrafo(line))) {
      return true;
    }
    if (this.equalsIgnoreReplacing(element, this.getDeclaracaoVariavel(line))) {
      return true;
    }
    if (this.equalsIgnoreReplacing(element, this.getDeclaracaoSelect(line))) {
      return true;
    }
    if (this.equalsIgnoreReplacing(element, this.getDeclaracaoClasse(line))) {
      return true;
    }
    if (this.equalsIgnoreReplacing(element, this.getCopyDeclaration(line))) {
      return true;
    }
    return false;
  }

  /**
   * Returns true if the specified text is a comment line or an empty line
   *
   * @param line
   */
  public isCommentOrEmptyLine(line: string): boolean {
    let trimmed = line.trim();
    return trimmed.startsWith("*>") || trimmed === "";
  }

  /**
   * Returns the patagraph declared in the line
   *
   * @param line
   */
  public getDeclaracaoParagrafo(line: string): string | undefined {
    var match = /^\s\s\s\s\s\s\s([\w\-]+)\.(\s*\*\>.*)?/g.exec(line);
    if (match == null) {
      return undefined;
    }
    return match[1];
  }

  /**
   * Returns the variable declared in the line
   *
   * @param line
   */
  public getDeclaracaoVariavel(line: string): string | undefined {
    // variable
    var match = /^\s+\d\d\s+(?:\(.*\))?([\w\-]+)(\s+|\.).*/i.exec(line);
    if (match == null) {
      // $SET CONSTANT
      match = /^\s+\$SET\s+CONSTANT\s+(?:\(.*\))?([\w\-]+)\s+.*/i.exec(line);
      if (match == null) {
        return undefined;
      }
    }
    return match[1];
  }

  /**
   * Returns the variable declared in the line ignoring replace
   *
   * @param line
   */
  public getDeclaracaoVariavelIgnoreReplace(line: string): string | undefined {
    // variable
    var match = /^\s+\d\d\s+(?:[\w\-]+)?(?:\(.*\))?([\w\-]+)(\s+|\.).*/i.exec(line);
    if (match == null) {
      // $SET CONSTANT
      match = /^\s+\$SET\s+CONSTANT\s+(?:\(.*\))?([\w\-]+)\s+.*/i.exec(line);
      if (match == null) {
        return undefined;
      }
    }
    return match[1];
  }

  /**
   * Returns the copy declared in the line
   *
   * @param line
   */
  public getCopyDeclaration(line: string): string | undefined {
    var match = /^\s+COPY\s+([A-Za-z0-9]+).(?:CPY|CPB).*/i.exec(line);
    if (match == null) {
      return undefined;
    }
    return match[1];
  }

  /**
   * Returns the select declared in the line
   *
   * @param line
   */
  private getDeclaracaoSelect(line: string): string | undefined {
    var match = /^\s+SELECT ([\w\-]+)\s+ASSIGN.*/i.exec(line);
    if (match == null) {
      return undefined;
    }
    return match[1];
  }

  /**
   * Returns the classe declared in the line
   *
   * @param line
   */
  private getDeclaracaoClasse(line: string): string | undefined {
    // IS Format
    var match = /^\s+CLASS\s+([\w]+)\s+AS.*/i.exec(line);
    if (match == null) {
      // MF Format
      match = /^\s+([\w]+)\s+IS\s+CLASS.*/i.exec(line);
      if (match == null) {
        return undefined;
      }
    }
    return match[1];
  }

  /**
   * Compare two terms ignoring replacing
   *
   * @param termo1
   * @param termo2
   */
  private equalsIgnoreReplacing(termo1: string, termo2?: string): boolean {
    if (termo1 == undefined || termo2 == undefined) {
      return false;
    }
    termo1 = termo1.toLocaleLowerCase();
    termo2 = termo2.toLocaleLowerCase();
    if (termo1 == termo2) {
      return true;
    }
    if (termo2.indexOf("(") >= 0) {
      let pattern = new RegExp(termo2.replace(/\(.*?\)/i, "(.*)"));
      if (pattern.test(termo1)) {
        return true;
      }
    }
    if (termo1.indexOf("(") >= 0) {
      let pattern = new RegExp(termo1.replace(/\(.*?\)/i, "(.*)"));
      if (pattern.test(termo1)) {
        return true;
      }
    }
    return false;
  }

}