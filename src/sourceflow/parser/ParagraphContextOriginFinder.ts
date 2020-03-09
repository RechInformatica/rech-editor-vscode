import ContextOriginFinderInterface from "./ContextOriginFinderInterface";
import { CobolReferencesFinder } from "../../lsp/references/CobolReferencesFinder";

export default class ParagraphContextOriginFinder implements ContextOriginFinderInterface {

    identify(line: number, buffer: string[]): Promise<number[]> {
        return new Promise((resolve, reject) => {
            const paragraphDeclarationRegex = /^\s{7}([\w\-]+)\.(?:\s*\*\>.*)?/gi;
            let result = new Array()
            let match = paragraphDeclarationRegex.exec(buffer[line]);
            let paragraphName;
            if (match && match[1]) {
                paragraphName = match[1];
            } else {
                return reject();
            }
            new CobolReferencesFinder(buffer.join("\n")).findReferences(paragraphName).then((positions) => {
                positions.forEach((p) => {
                    if (!buffer[p.line].match(paragraphDeclarationRegex)) {
                        result.push(p.line);
                    }
                });
                return resolve(result);
            }).catch(() => {
                reject();
            });
        });
    }
}