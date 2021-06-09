import { CompletionItemKind, CompletionItem, MarkupKind } from "vscode-languageserver";
import { CompletionInterface } from "./CompletionInterface";
import { ParserCobol } from "../../cobol/parsercobol";
import { CobolDocParser } from "../../cobol/rechdoc/CobolDocParser";
import { Scan } from "rech-ts-commons";
import { CobolVariable } from "./CobolVariable";

/**
 * Class to generate LSP Completion Items for Cobol 'add' clause
 */
export class ClassCompletion implements CompletionInterface {

  /** Cache of completion itens of the last source preprocessed*/
  private static cache: Map<string, CompletionItem> | undefined;
  /** File name of the source in cahce */
  private static cacheSourceFileName: string;
  /** Cobol parser */
  private parserCobol: ParserCobol;
  /** Cobol documentation parser */
  private cobolDocParser: CobolDocParser;
  /** Cache file name */
  private cacheFileName: string;
  /** uri of file */
  private uri: string;
  /** Current lines in the source */
  private currentLines: string[] | undefined;
  /** Special class puller  */
  private specialClassPuller: Thenable<string>;


  constructor(cacheFileName: string, uri: string, specialClassPuller: Thenable<string>) {
    this.parserCobol = new ParserCobol();
    this.cobolDocParser = new CobolDocParser();
    this.cacheFileName = cacheFileName;
    this.uri = uri;
    this.specialClassPuller = specialClassPuller;
  }

  public generate(_line: number, _column: number, lines: string[]): Promise<CompletionItem[]> {
    return new Promise((resolve, _reject) => {
      this.currentLines = lines;
      this.loadCache().then().catch();
      let items: CompletionItem[] = [];
      if (ClassCompletion.cache && ClassCompletion.cacheSourceFileName == this.cacheFileName) {
        items = Array.from(ClassCompletion.cache.values());
      }
      resolve(items);
    });
  }

  /**
   * Load the cache
   *
   * @param _line
   * @param _column
   */
  private loadCache(): Promise<void> {
    return new Promise((resolve, _reject) => {
      this.specialClassPuller.then((classes: string) => {
        ClassCompletion.cache = this.parserSpecialClasses(classes)
        ClassCompletion.cacheSourceFileName = this.cacheFileName;
        return resolve();
      }, (cause)=> {
        console.log(cause);
        ClassCompletion.cache = this.generateClassCompletion(<string[]>this.currentLines)
        ClassCompletion.cacheSourceFileName = this.cacheFileName;
        return resolve();
      });
    });
  }

  /**
   * Parser the special class result
   *
   * @param classes
   */
  private parserSpecialClasses(classes: string): Map<string, CompletionItem> {
    const items: Map<string, CompletionItem> = new Map;
    const buffer = classes.split("\n");
    for (let i = 0; i < buffer.length; i++) {
      const linha = buffer[i];
      if (!linha.trim().startsWith("#")) {
        const parts = linha.split("=");
        const className = parts[0];
        const packagex = parts[1] ? parts[1] : ""
        const documentation = "*>-> " + packagex.replace("\r", "");
        const classItem = this.createClassCompletion(className, [documentation]);
        items.set(className, classItem);
      }
    }
    return items;
  }

  /**
   * Generates completions based on statement of class
   *
   * @param _line
   * @param _column
   * @param lines
   * @param useCache
   */
  private generateClassCompletion(lines: string[]): Map<string, CompletionItem> {
    const items: Map<string, CompletionItem> = new Map;
    const buffer = lines.join("\n");
    new Scan(buffer).scan(/(?:^\s+CLASS\s+([\w]+)\s+AS.*|^\s+([\w]+)\s+IS\s+CLASS.*)/gim, (iterator: any) => {
      if (this.parserCobol.getDeclaracaoClasse(iterator.lineContent.toString())) {
        const classs = CobolVariable.parseLines(iterator.row, lines, {ignoreMethodReturn: true, noChildren: true, noScope: true, noSection: true});
        const classItem = this.createClassCompletion(classs.getName(), classs.getComment());
        items.set(classs.getName(), classItem);
      }
    });
    return items;
  }

  /**
   * Creates and pushes a completion item for the specified class
   *
   * @param classs class name
   * @param documentation documentation array
   */
  private createClassCompletion(classs: string, documentation: string[] | undefined): CompletionItem {
    const cobolDoc = this.cobolDocParser.parseCobolDoc(documentation != undefined ? documentation : []);
    return {
      label: classs,
      detail: cobolDoc.comment.join(" "),
      documentation: {
        kind: MarkupKind.Markdown,
        value: cobolDoc.elementsAsMarkdown()
      },
      kind: CompletionItemKind.Class
    };
  }

}
