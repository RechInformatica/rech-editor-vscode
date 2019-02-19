import { VariableInsertTextBuilder } from "./VariableInsertTextBuilder";
import { CompletionUtils } from "../../commons/CompletionUtils";

/**
 * Implementation to build the insertText of variable completions with the variable name and command separator clause.
 *
 * For instance, variable with 'to' or 'from' clauses.
 */
export class CommandSeparatorInsertTextBuilder implements VariableInsertTextBuilder {

    /** Clause to separate variables within the command */
    private commandSeparatorClause: string;

    constructor(commandSeparatorClause: string) {
        this.commandSeparatorClause = commandSeparatorClause;
    }

    /**
     * Builds the insertText of variable completion items
     *
     * @param variableName name of the variable to be suggested
     * @param _currentCommand command located on the line where cursor is currently positioned
     */
    buildInsertText(variableName: string, currentCommand: string): string {
        //
        let lineWithoutEnter = currentCommand.replace("\r", "").replace("\n", "");
        let finalCommand = CompletionUtils.replaceLastWord(lineWithoutEnter, variableName);
        let insertText = variableName + CompletionUtils.fillSpacesFromWordEnd(30, finalCommand.length, finalCommand);
        //
        insertText = insertText + this.commandSeparatorClause;
        //
        finalCommand = CompletionUtils.replaceLastWord(finalCommand, insertText);
        insertText = insertText + CompletionUtils.fillSpacesFromWordEnd(35, finalCommand.length, finalCommand);
        return insertText;
    }
}