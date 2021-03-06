import { assert } from "chai";
import "mocha";
import * as path from "path";
import { Scan } from "rech-ts-commons";
import { File } from "../../commons/file";
import { Path } from "../../commons/path";

describe("Buffer scan functions", () => {
  // Test scan the buffer
  it("Scan the buffer", done => {
    new File(new Path(path.resolve(__dirname) + "/../TestFiles/PROCEDURE.CBL").fullPath()).loadBuffer("latin1").then(buffer => {
      const term = "PLIS-ACESEL";
      const expectedLine = 9;
      const expectedColumn = 34;
      new Scan(buffer).scan(new RegExp(term, "gi"), (iterator: any) => {
        if (iterator.lineContent.includes(term)) {
          assert.equal(expectedColumn, iterator.column);
          assert.equal(expectedLine, iterator.row + 1);
          iterator.stop();
        }
      });
      done();
    }).catch();
  });
});
