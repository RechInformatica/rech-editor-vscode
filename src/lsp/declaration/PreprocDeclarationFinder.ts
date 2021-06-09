import { ExpandedSourceManager } from "../../cobol/ExpandedSourceManager";
import { Path } from "../../commons/path";
import { RechPosition } from "../../commons/rechposition";
import { Scan } from "rech-ts-commons";
import { ParserCobol } from "../../cobol/parsercobol";
import { File } from "../../commons/file";
import { FindInterface, FindParameters } from "./FindInterface";

/**
 * Class to find declaration of COBOL elements inside a preprocessed source
 */
export class PreprocDeclarationFinder implements FindInterface {

  private parser: ParserCobol;

  constructor(private lines: string[]) {
    this.parser = new ParserCobol();
  }

  findDeclaration(findParams: FindParameters): Promise<RechPosition> {
    return this.findDeclarationWithPreproc(findParams.term, findParams.uri, findParams.lineIndex, true);
  }

  private findDeclarationWithPreproc(term: string, uri: string, referenceLine: number, expandSource: boolean): Promise<RechPosition> {
    return new Promise((resolve, reject) => {
      ExpandedSourceManager.getExpandedSource(uri).then((expandedSource) => {
        const path = new Path(uri);
        this.findDeclarationInPreprocessedSource(term, path, expandedSource, referenceLine).then((result) => {
          if (result) {
            return resolve(result);
          }
          if (!expandSource) {
            return reject();
          }
          new ExpandedSourceManager(uri).expandSource().then(() => { }).catch(() => { });
          this.findDeclarationWithPreproc(term, uri, referenceLine, false)
            .then((result) => resolve(result))
            .catch(() => reject());
        }).catch(() => reject());
      }).catch(() => reject());
    });
  }

  private findDeclarationInPreprocessedSource(term: string, path: Path, buffer: string, referenceLine: number): Promise<RechPosition> {
    return new Promise((resolve, reject) => {
      let result: RechPosition | undefined = undefined;
      let file = path.fileName();
      new Scan(buffer).scan(/\s+\*\>\sOpções:.*/gi, (iterator: any) => {
        const match = /^\s+\*\>\sOpções:\s([A-Za-z0-9\\:]+\.(?:CBL|COB))/gm.exec(iterator.lineContent)
        if (match) {
          file = new Path(match[1]).fileName();
          iterator.stop();
        }
      });
      let line = this.lines[referenceLine].trim();
      // Escape some COBOL characters which are Regex reserved symbols
      line = line.replace(/([*.,()\\+=>:])/g, "\\$1");
      let referenceLineForScan: number;
      const patter = new RegExp(`${line}\\s*\\*\\>\\:\\s+\\d+\\s+\\d+$`, 'gi');
      new Scan(buffer).scan(patter, (iterator: any) => {
        referenceLineForScan = iterator.row;
      });
      referenceLineForScan = this.lines.length;
      new Scan(buffer).reverseScan(new RegExp(term, 'gi'), referenceLineForScan, (iterator: any) => {
        if (this.parser.isDeclaration(term, iterator.lineContent)) {
          result = this.buildPositionFromPreprocessedLine(file, path, iterator.lineContent, iterator.column);
          iterator.stop();
        }
      });
      if (result) {
        resolve(<RechPosition>result);
      } else {
        reject();
      }
    });
  }

  private buildPositionFromPreprocessedLine(file: string, path: Path, lineContent: string, column: number): RechPosition {
    const match = <RegExpMatchArray>/.*\*\>\s+\d+\s+(\d+)(?:\s+(.+\....)\s+\(\d+\))?/.exec(lineContent);
    const line = parseInt(match[1]) - 1;
    const filePositionGroup = 2;
    if (match[filePositionGroup]) {
      file = match[filePositionGroup];
    }
    return new RechPosition(line, column, this.getFullPath(file, path));
  }

  private getFullPath(file: string, path: Path): string {
    const preferredDirectory = new Path(path.fullPathWin()).directory().toUpperCase();
    if (new File(preferredDirectory + file).exists()) {
      return preferredDirectory + file;
    }
    return "F:\\SIGER\\DES\\FON\\" + file;
  }


}
