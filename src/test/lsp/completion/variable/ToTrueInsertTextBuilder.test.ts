import { expect } from 'chai';
import 'mocha';
import { ToTrueInsertTextBuilder } from '../../../../lsp/completion/variable/ToTrueInsertTextBuilder';


    describe('Variable suggestions insert text with command separator', () => {

        it('Checks the insertText with set to true and dot', async () => {
            let text = new ToTrueInsertTextBuilder().buildInsertText("privez-sim", true, "           set     ", 19);
            expect("privez-sim to  true.").to.equal(text);
        });
        it('Checks the insertText with set to true and comma', async () => {
            let text = new ToTrueInsertTextBuilder().buildInsertText("privez-sim", true, "              set     ", 22);
            expect("privez-sim to true,").to.equal(text);
        });
        it('Checks the insertText with set to and object reference', async () => {
            let text = new ToTrueInsertTextBuilder().buildInsertText("privez-sim", false, "              set     ", 22);
            expect("privez-sim to ").to.equal(text);
        });

    });