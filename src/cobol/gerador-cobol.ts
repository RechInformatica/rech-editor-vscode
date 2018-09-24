'use babel';
import { Editor } from '../editor/editor';
import * as Colunas from './colunas';

export default class GeradorCobol {
  editor: Editor;

  constructor() {
    this.editor = new Editor();
  }

  /**
   * Insert a command "MOVE"
   */
  move() {
    this.editor.type("MOVE", Colunas.COLUNA_A);
  }

  /**
   * Digita Spaces
   */
  spaces() {
    this.editor.type("SPACES");
  }

  /**
   * Digita Zeros
   */
  zeros() {
    this.editor.type("ZEROS");
  }

  /**
   * Digita LowValues
   */
  lowvalues() {
    this.editor.type("LOWVALUES");
  }

  /**
   * Digita To
   */
  to() {
    this.editor.type("TO", Colunas.COLUNA_C, this.gotoColTo());
  }

  /**
   * Copy entire line to clipboard wherever the cursor is
   */
  copyLine() {
    let cursor = this.editor.getCursor();
    this.editor.selectWholeLines();
    this.editor.clipboardCopy();
    this.editor.setCursor(cursor.line, cursor.character);
  }

  /**
   * Paste clipboard in a new line wherever the cursor is
   */
  pasteLine() {
    let cursor = this.editor.getCursor();
    this.editor.insertLineAbove();
    this.editor.clipboardPaste();
    this.editor.setCursor(cursor.line, cursor.character);
  }

  /**
   * Insert a new line above, keeping the cursor in the same position
   */
  newLineAbove() {
    let position = this.editor.getCursor().character;
    this.editor.insertLineAbove().then(
      success => {
        this.editor.setColumn(position);
      }
    );
  }
  
  /**
   * Insert a comment line above 
   */
  async insertCommentLine() {
    await this.editor.insertLineAbove();
    await this.editor.type("      *>-> ");
  }


  /**
   * Adiciona um comentário
   */
  // comment(commentText: string) {
  //   this.editor.insertSnippetAboveCurrentLineNoIdent("      *>-> ");
  //   this.type(commentText);
  // }

  /**
   * Adjust the position of command "TO"
   */
  gotoColTo() {
    let position = this.editor.getCursor().character;
    if (position < Colunas.COLUNA_B) {
      return Colunas.COLUNA_B;
    } else {
      if (position >= 31) {
        return Colunas.COLUNA_C;
      } else {
        return 1;
      }
    }
  }


};