import { ParserCobol } from "../../cobol/parsercobol";
import { CobolDocParser } from "../../cobol/rechdoc/CobolDocParser";
import { MarkupKind, CompletionItemKind, CompletionItem } from "vscode-languageserver";
import { CompletionInterface } from "./CompletionInterface";
import { Scan, BufferSplitter } from "rech-ts-commons";
import { ExpandedSourceManager } from "../../cobol/ExpandedSourceManager";
import { CompletionUtils } from "../commons/CompletionUtils";

/** Reserved COBOL words which aren't paragraphs although are declared on the same way as a paragraph */
const COBOL_PARAGRAPHS_BLACKLIST = ['class-id', 'program-id', 'factory', 'method-id', 'object', 'repository', 'special-names'];

/**
 * Class to generate LSP Completion Items for Cobol paragraphs declarations
 */
export class ParagraphCompletion implements CompletionInterface {

    /** Cache of completion itens of the last source preprocessed*/
    private static cache: Map<string, CompletionItem> | undefined;
    /** File name of the source in cahce */
    private static cacheSourceFileName: string;
    /** Cobol parser */
    private parserCobol: ParserCobol;
    /** Cobol documentation parser */
    private cobolDocParser: CobolDocParser;
    /** Current lines in the source */
    private currentLines: string[] | undefined;
    /** Current line number */
    private lineNumber: number = 0;
    /** Column where user started typing paragraph name. This column tells VSCode where replacement should start within the current line */
    private rangeColumn: number = 0;

    constructor(private cacheFileName: string, private uri: string, private sourceOfCompletions: Thenable<string>) {
        this.parserCobol = new ParserCobol();
        this.cobolDocParser = new CobolDocParser();
    }

    public generate(line: number, column: number, lines: string[]): Promise<CompletionItem[]> {
        return new Promise((resolve, _reject) => {
            this.currentLines = lines;
            this.lineNumber = line;
            this.rangeColumn = CompletionUtils.findWordStartWithinLine(column, lines[line]) - 1;
            this.loadCache().then().catch();
            let items: CompletionItem[] = [];
            if (ParagraphCompletion.cache && ParagraphCompletion.cacheSourceFileName == this.cacheFileName) {
                items = Array.from(ParagraphCompletion.cache.values());
            } else {
                items = Array.from(this.generateParagraphCompletion(this.currentLines, false).values());
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
        return new Promise((resolve, reject) => {
            this.sourceOfCompletions.then((sourceOfCompletions) => {
                if (sourceOfCompletions == "local") {
                    ParagraphCompletion.cache = this.generateParagraphCompletion(<string[]>this.currentLines, false)
                    ParagraphCompletion.cacheSourceFileName = this.cacheFileName;
                    return resolve();
                }
                ExpandedSourceManager.getExpandedSource(this.uri).then((buffer) => {
                    ParagraphCompletion.cacheSourceFileName = this.cacheFileName;
                    ParagraphCompletion.cache = this.generateParagraphCompletion(BufferSplitter.split(buffer.toString()), true);
                    return resolve();
                }).catch(() => {
                    return reject();
                })
            });
        });
    }

    /**
     * Generates completions based on statement of paragraphs
     *
     * @param _line
     * @param _column
     * @param lines
     * @param useCache
     */
    private generateParagraphCompletion(lines: string[], useCache: boolean): Map<string, CompletionItem> {
        const items: Map<string, CompletionItem> = new Map;
        const buffer = lines.join("\n");
        new Scan(buffer).scan(/^\s\s\s\s\s\s\s([\w\-]+)\.(?:\s*\*\>.*)?/gm, (iterator: any) => {
            const paragraphName = this.parserCobol.getDeclaracaoParagrafo(iterator.lineContent.toString());
            if (paragraphName && !this.isReservedWord(paragraphName)) {
                const docArray = this.getElementDocumentation(lines, iterator.row);
                const paragraphItem = this.createParagraphCompletion(paragraphName, docArray);
                items.set(paragraphName, paragraphItem);
            }
        });
        // Merge the cache with the local paragraphs
        if (useCache) {
            this.generateParagraphCompletion(<string[]>this.currentLines, false).forEach((value, key) => {
                if (!items.has(key)) {
                    items.set(key, value);
                }
            })
        }
        return items;
    }

    /**
     * Returns true whether the specified paragraph name represents a reserved COBOL word
     */
    private isReservedWord(paragraphName: string) {
        return COBOL_PARAGRAPHS_BLACKLIST.some((word) => word === paragraphName);
    }

    /**
     * Creates and pushes a completion item for the specified paragraph
     *
     * @param paragraph paragraph name
     * @param docArray documentation array
     */
    private createParagraphCompletion(paragraph: string, docArray: string[]): CompletionItem {
        const cobolDoc = this.cobolDocParser.parseCobolDoc(docArray);
        return {
            label: paragraph,
            textEdit: {
                newText: paragraph,
                range: {
                    start: {line: this.lineNumber, character: this.rangeColumn},
                    end: {line: this.lineNumber, character: this.rangeColumn}
                }
            },
            detail: cobolDoc.comment.join(" "),
            documentation: {
                kind: MarkupKind.Markdown,
                value: cobolDoc.elementsAsMarkdown()
            },
            kind: CompletionItemKind.Method
        };
    }

    /**
     * Returns the documentation of the element on the specified line
     *
     * @param lines buffer lines
     * @param lineIndex line with the paragraph declaration which will have the documentation extracted
     */
    private getElementDocumentation(lines: string[], lineIndex: number): string[] {
        let documentation: string[] = [];
        for (let index = lineIndex - 1; index >= 0; index--) {
            const currentLineText = lines[index];
            if (currentLineText.startsWith("      *>")) {
                documentation.push(currentLineText);
            } else {
                break;
            }
        }
        documentation = documentation.reverse();
        return documentation;
    }

    /**
     * Clear the paragraphs cache
     */
    public static clearCache() {
        ParagraphCompletion.cache = new Map();
        ParagraphCompletion.cacheSourceFileName = "";
    }

}
