import { CompletionItemKind, CompletionItem, InsertTextFormat } from "vscode-languageserver";
import { CompletionInterface } from "./CompletionInterface";
import { CompletionUtils } from "../commons/CompletionUtils";

// Cobol column for a variable of evaluate declaration
const UNTIL_COLUMN_DECLARATION = 35;
/**
 * Class to generate LSP Completion Items for Cobol evaluate declarations
 */
export class PerformUntilExitCompletion implements CompletionInterface {

    public generate(_line: number, column: number, _lines: string[]): CompletionItem[] {
        let text = "";
        text = text.concat("perform");
        text = text.concat(CompletionUtils.fillMissingSpaces(UNTIL_COLUMN_DECLARATION, column + text.length - 1) + "until exit");
        return [{
            label: 'Gerar declaração de laço até sair (until exit).',
            detail: 'Gera a declaração de laço até sair (until exit).',
            insertText: text,
            insertTextFormat: InsertTextFormat.Snippet,
            filterText: "pu",
            preselect: true,
            kind: CompletionItemKind.Keyword,
            data: 7
        }];
    }

}