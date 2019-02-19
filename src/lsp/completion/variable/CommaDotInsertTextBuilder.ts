import { VariableInsertTextBuilder } from "./VariableInsertTextBuilder";
import { CompletionUtils } from "../../commons/CompletionUtils";

/**
 * Implementation to build the insertText of variable completions with dot or comma after the variable
 */
export class CommaDotInsertTextBuilder implements VariableInsertTextBuilder {

    /**
     * Builds the insertText of variable completion items
     *
     * @param variableName name of the variable to be suggested
     * @param currentCommand command located on the line where cursor is currently positioned
     */
    buildInsertText(variableName: string, currentCommand: string): string {
        return variableName + CompletionUtils.separatorForColumn(CompletionUtils.getFirstCharacterColumn(currentCommand));
    }
}