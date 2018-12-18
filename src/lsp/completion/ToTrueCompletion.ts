import { CompletionItemKind, CompletionItem, InsertTextFormat } from "vscode-languageserver";
import { CompletionInterface } from "./CompletionInterface";
import { ToCompletion } from "./ToCompletion";
import { CompletionUtils } from "../commons/CompletionUtils";

/**
 * Class to generate LSP Completion Items for Cobol 'to true' clause
 */
export class ToTrueCompletion implements CompletionInterface {

    public generate(line: number, column: number, lines: string[]): CompletionItem[] {
        let currentText = lines[line];
        let text = "";
        text = new ToCompletion().buildToTextWithIndent(column);
        text = text.concat("true");
        text = text.concat(CompletionUtils.separatorForColumn(CompletionUtils.getFirstCharacterColumn(currentText)));
        return [{
            label: 'Gerar comando TO TRUE',
            detail: 'Gera o comando TO TRUE colocando o cursor no fim da linha',
            insertText: text,
            insertTextFormat: InsertTextFormat.Snippet,
            filterText: "to true tt",
            preselect: true,
            kind: CompletionItemKind.Keyword
        }];
    }

}