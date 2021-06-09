/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
"use strict";

import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  DidChangeConfigurationNotification,
  Location,
  InitializeParams,
  TextDocumentPositionParams,
  Range,
  Position,
  CompletionItem,
  DocumentOnTypeFormattingParams,
  DocumentHighlight,
  FoldingRangeRequestParam,
  FoldingRange,
  ResponseError,
  TextDocumentChangeEvent,
  ErrorCodes,
  ReferenceParams,
  WorkspaceEdit,
  RenameParams,
  CodeActionParams,
  CodeAction,
  FoldingRangeRequest,
  TextDocumentSyncKind,
} from "vscode-languageserver";
import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { CobolDeclarationFinder } from "./declaration/CobolDeclarationFinder";
import { Path } from "../commons/path";
import { RechPosition } from "../commons/rechposition";
import { CobolWordFinder } from "../commons/CobolWordFinder";
import { Diagnostician } from "../cobol/diagnostic/diagnostician";
import { CobolFormatter } from "./formatter/CobolFormatter";
import { CobolCompletionItemFactory } from "./completion/CobolCompletionItemFactory";
import { DynamicJsonCompletion } from "./completion/DynamicJsonCompletion";
import { ParagraphCompletion } from "./completion/ParagraphCompletion";
import { HighlightFactory } from "./highlight/HighlightFactory";
import { CobolFoldFactory } from "./fold/CobolFoldFactory";
import { ExpandedSourceManager } from "../cobol/ExpandedSourceManager";
import { VariableCompletion } from "./completion/variable/VariableCompletion";
import { VariableCompletionFactory } from "./completion/variable/VariableCompletionFactory";
import { Log } from "../commons/Log";
import { BufferSplitter } from "rech-ts-commons";
import { CobolDiagnosticParser } from "../cobol/diagnostic/cobolDiagnosticParser";
import { ClassCompletion } from "./completion/ClassCompletion";
import { MethodCompletion } from "./completion/method/MethodCompletion";
import { CobolReferencesFinder } from "./references/CobolReferencesFinder";
import { CobolActionFactory } from "./actions/CobolActionFactory";
import { RenamingUtils } from "./commons/RenamingUtils";

/** Max lines in the source to active the folding */
const MAX_LINE_IN_SOURCE_TO_FOLDING = 10000
// Create a connection for the server. The connection uses Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);
let loggingConfigured: boolean;

let hasDiagnosticRelatedInformationCapability: boolean | undefined = false;
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

connection.onInitialize(async (params: InitializeParams) => {
  const capabilities = params.capabilities;
  hasDiagnosticRelatedInformationCapability =
    capabilities.textDocument &&
    capabilities.textDocument.publishDiagnostics &&
    capabilities.textDocument.publishDiagnostics.relatedInformation;
  ExpandedSourceManager.setSourceExpander((uri: string, cacheFileName: string) => {
    return sendExternalPreprocExpanderExecution(uri, cacheFileName);
  });
  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      definitionProvider: true,
      referencesProvider: true,
      documentHighlightProvider: true,
      // Tell the client that the server supports code completion
      completionProvider: {
        resolveProvider: true
      },
      codeActionProvider: true,
      foldingRangeProvider: false,
      renameProvider: true,
      documentOnTypeFormattingProvider: {
        firstTriggerCharacter: "\n",
        moreTriggerCharacter: ["N", 'n', 'E', 'e'],
      }
    }
  };
});

/** Sets the ExpanderSource Statusbar controll callback */
ExpandedSourceManager.setStatusBarFromSourceExpander((file?: string) => {
  return connection.sendRequest("custom/showStatusBarFromSourceExpander", file);
}, () => {
  return connection.sendRequest("custom/hideStatusBarFromSourceExpander");
});

/** When requesto to return the declaration position of term */
connection.onRequest("custom/findDeclarationPosition", (word: string, referenceLine: number, referenceColumn: number, fullDocument: string, uri: string) => {
  return new Promise((resolve, reject) => {
    Log.get().info("Found declaration position request for " + word + " starting");
    callCobolDeclarationFinder(word, referenceLine, referenceColumn, fullDocument, uri).then((position) => {
      Log.get().info("Found declaration position request for " + word + " in " + position.file + " request on " + uri);
      resolve(position);
    }).catch(() => {
      Log.get().warning("Could not find declaration position request for " + word + " request on " + uri);
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to find declaration"));
    });
  })
})

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(change => {
  validateTextDocument(change.document, "onChange").then().catch();
  // Clear the folding cache
  // Does this not folding if the source has any changes
  CobolFoldFactory.foldingCache.delete(change.document.uri);
});

/**
 * If the document saved
 */
documents.onDidSave(document => {
  const uri = document.document.uri;
  // Validate the document
  validateTextDocument(document.document, "onSave").then().catch();
  // Update the folding
  loadFolding(document);
  connection.client.register(FoldingRangeRequest.type, undefined);
  // Update the expanded source
  new ExpandedSourceManager(uri).expandSource().then().catch()
  // Clear the variableCompletion cache
  VariableCompletion.removeCache(uri);
  // Clear the copy hierarchy from cache
  CobolDiagnosticParser.removeSourceFromCopyCache(new Path(uri).fullPath());
})

// If the document opened
documents.onDidOpen(document => {
  configureServerLog().then().catch();
  // Validate the document
  validateTextDocument(document.document, true).then().catch();
  // Load the folding
  loadFolding(document);
  // Load the expanded source
  new ExpandedSourceManager(document.document.uri).expandSource().then().catch();
});

// If the document closed
documents.onDidClose(textDocument => {
  const uri = textDocument.document.uri
  // Clear the folding cache
  CobolFoldFactory.foldingCache.delete(uri);
  // Clear the expanded source cache
  ExpandedSourceManager.removeSourceOfCache(uri);
  // Clear the copy hierarchy from cache
  CobolDiagnosticParser.removeSourceFromCopyCache(new Path(uri).fullPath());
  // Clear the variableCompletion cache
  VariableCompletion.removeCache(uri);
  //Clear the computed diagnostics to VSCode.
  connection.sendDiagnostics({
    uri: uri,
    diagnostics: []
  });
});

/**
 * Load the folding of the source
 *
 * @param document
 */
export function loadFolding(document: TextDocumentChangeEvent<TextDocument>) {
  if (document.document.lineCount > MAX_LINE_IN_SOURCE_TO_FOLDING) {
    return;
  }
  const uri = document.document.uri;
  const fullDocument = documents.get(uri);
  if (fullDocument) {
    const text = fullDocument.getText();
    getConfig<boolean>("folding").then(foldingConfig => {
      if (foldingConfig) {
        new CobolFoldFactory()
          .fold(
            uri,
            BufferSplitter.split(text),
            () => sendRequestToShowFoldStatusBar("Load folding from: " + uri),
            () => sendRequestToHideFoldStatusBar()
          )
          .then()
          .catch();
      } else {
        sendRequestToHideFoldStatusBar();
      }
    }).catch(() => {
      sendRequestToHideFoldStatusBar();
      return;
    });
  }
}

/**
 * Create diagnostics for all errors or warnings
 *
 * @param textDocument
 */
export async function validateTextDocument(textDocument: TextDocument, event: "onSave" | "onChange" | boolean): Promise<void> {
  return getAutoDiagnostic().then(autodiagnostic => {
    if (autodiagnostic && (event === true || autodiagnostic == event)) {
      const document = documents.get(textDocument.uri)
      if (document) {
        const text = document.getText();
        Log.get().info("Diagnose from " + document.uri + " starting");
        new Diagnostician(text).diagnose(
          textDocument,
          (fileName) => {
            return sendExternalPreprocessExecution(fileName, new Path(new Path(document.uri).fullPathWin()).directory());
          },
          (fileName) => {
            return sendExternalGetCopyHierarchy(fileName);
          },
          (message) => {
            return externalDiagnosticFilter(message);
          },
          (message) => {
            return externalDeprecatedWarning(message);
          }
        ).then(diagnostics => {
          Log.get().info("Diagnose from " + textDocument.uri + " resulted ok");
          //Send the computed diagnostics to VSCode.
          connection.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: diagnostics
          });
        }).catch(() => {
          Log.get().info("Diagnose from " + textDocument.uri + " resulted empty");
          //Send the computed diagnostics to VSCode.
          connection.sendDiagnostics({
            uri: textDocument.uri,
            diagnostics: []
          });
        });
      }
    }
  });
}

/**
 * Sends a request to the client for Cobol preprocessor execution
 *
 * @param uri current URI of the file open in editor
 */
export function sendExternalPreprocessExecution(uri: string, path: string) {
  const files = [uri, path];
  return connection.sendRequest<string>("custom/runPreprocessor", [files]);
}

/**
 * Sends a request to the client for return the Copy Hierarchy of source
 *
 * @param uri current URI of the file open in editor
 */
export function sendExternalGetCopyHierarchy(uri: string) {
  return connection.sendRequest<string>("custom/runCopyHierarchy", uri);
}

/**
 * Sends a request to the client to get a specific setting
 *
 * @param section
 */
export function getConfig<T>(section: string) {
  return new Promise<T>((resolve, reject) => {
    return connection.sendRequest<T>("custom/getConfig", section).then((config) => {
      return resolve(config);
    }, () => {
      reject();
    });
  })
}

/**
 * Sends a request to the client to identify if should activate auto diagnostic
 */
export function getAutoDiagnostic() {
  return connection.sendRequest<"onChange" | "onSave" | boolean>("custom/getAutoDiagnostic");
}

/**
 * Sends a request to the client for get a specific setting
 *
 * @param section
 */
export function externalDiagnosticFilter(diagnosticMessage: string) {
  return connection.sendRequest<boolean>(
    "custom/diagnosticFilter",
    diagnosticMessage
  );
}

/**
 * Sends a request to the client for get a specific setting
 *
 * @param section
 */
export function externalDeprecatedWarning(diagnosticMessage: string) {
  return connection.sendRequest<boolean>(
    "custom/deprecatedWarning",
    diagnosticMessage
  );
}

connection.onFoldingRanges((_foldingRangeRequestParam: FoldingRangeRequestParam): Thenable<FoldingRange[] | ResponseError<undefined>> => {
  Log.get().info(`Called callback of onFoldingRanges. File ${_foldingRangeRequestParam.textDocument.uri}`);
  sendRequestToShowFoldStatusBar("Applying Folding from: " + _foldingRangeRequestParam.textDocument.uri);
  return new Promise((resolve, reject) => {
    const uri = _foldingRangeRequestParam.textDocument.uri;
    const folding = CobolFoldFactory.foldingCache.get(uri);
    getConfig<boolean>("folding").then((foldingConfig) => {
      if (foldingConfig && folding) {
        Log.get().info("Called callback of onFoldingRanges");
        sendRequestToHideFoldStatusBar();
        return resolve(folding)
      } else {
        Log.get().warning(`Error on folding. File ${uri}`);
        sendRequestToHideFoldStatusBar();
        return reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error on folding"));
      }
    }).catch(() => {
      sendRequestToHideFoldStatusBar();
      return reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error on folding"));
    })
  });
});

/**
 * Provide the document highlight positions
 */
connection.onDocumentHighlight((_textDocumentPosition: TextDocumentPositionParams): Thenable<DocumentHighlight[]> => {
  return new Promise((resolve, reject) => {
    const fullDocument = documents.get(_textDocumentPosition.textDocument.uri);
    if (fullDocument) {
      const text = fullDocument.getText();
      const line = _textDocumentPosition.position.line;
      const character = _textDocumentPosition.position.character
      const word = getLineText(text, line, character);
      const result = new HighlightFactory().getHighlightsPositions(fullDocument!, word, line, character)
      if (result) {
        return resolve(result)
      } else {
        reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to high ligth"))
      }
    } else {
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to high ligth"))
    }
  })
})

// This handler provides the initial list of the completion items.
connection.onCompletion((_textDocumentPosition: TextDocumentPositionParams): Thenable<CompletionItem[]> => {
  Log.get().info(`Called callback of onCompletion. File ${_textDocumentPosition.textDocument.uri}`);
  return new Promise((resolve, reject) => {
    getSnippetsRepositories().then((repositories) => {
      const line = _textDocumentPosition.position.line;
      const column = _textDocumentPosition.position.character;
      const uri = _textDocumentPosition.textDocument.uri;
      const cacheFileName = buildCacheFileName(uri);
      const fullDocument = documents.get(uri);
      if (fullDocument) {
        new CobolCompletionItemFactory(line, column, BufferSplitter.split(fullDocument.getText()), uri)
          .addCompletionImplementation(new DynamicJsonCompletion(repositories, uri))
          .setParagraphCompletion(new ParagraphCompletion(cacheFileName, uri, getCurrentSourceOfParagraphCompletions()))
          .setClassCompletion(new ClassCompletion(cacheFileName, uri, getSpecialClassPuller(uri)))
          .setMethodCompletion(new MethodCompletion(uri))
          .setVariableCompletionFactory(new VariableCompletionFactory(uri, getCurrentSourceOfVariableCompletions()))
          .generateCompletionItems().then((items) => {
            Log.get().info(`Generated ${items.length} CompletionItems. File: ${_textDocumentPosition.textDocument.uri}`);
            resolve(items);
          }).catch(() => {
            Log.get().error(`Error loading Completion Items. CobolCompletionItemFactory.generateCompletionItems() is rejected. File: ${_textDocumentPosition.textDocument.uri}`);
            reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error loading Completion Items"))
          })
      } else {
        Log.get().error(`Error loading Completion Items. fullDocument is undefined. File: ${_textDocumentPosition.textDocument.uri}`);
        reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error loading Completion Items. fullDocument is undefined"))
      };
    }).catch(() => {
      Log.get().error(`Error loading Completion Items. Error to getConfig snippetsRepositories. File: ${_textDocumentPosition.textDocument.uri}`);
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error loading Completion Items. fullDocument is undefined"))
    });
  });
});

let snippetsRepositories: string[] | undefined;
function getSnippetsRepositories(): Promise<string[]> {
  return new Promise((resolve, reject) => {
    if (snippetsRepositories) {
      resolve(snippetsRepositories)
    } else {
      getConfig<string[]>("snippetsRepositories").then((repositories) => {
        snippetsRepositories = repositories;
        resolve(repositories);
      }).catch(() => {
        reject();
      })
    }
  })
}

/**
 * Returns the current source of completionsItems
 */
function getCurrentSourceOfParagraphCompletions() {
  return connection.sendRequest<string>("custom/sourceOfParagraphCompletions")
}

/**
 * Returns the current source of completionsItems
 */
function getCurrentSourceOfVariableCompletions() {
  return connection.sendRequest<string>("custom/sourceOfVariableCompletions")
}

/**
 * Returns the current source of completionsItems
 */
function getSpecialClassPuller(uri: string): Thenable<string> {
  return connection.sendRequest<string>("custom/specialClassPuller", uri)
}

/**
 * Send request to show folding status bar
 */
function sendRequestToShowFoldStatusBar(file?: string) {
  return connection.sendRequest("custom/showFoldinStatusBar", file)
}

/**
 * Send request to hide folding status bar
 */
function sendRequestToHideFoldStatusBar() {
  return connection.sendRequest("custom/hideFoldinStatusBar")
}

/**
 * Document formatter
 */
connection.onDocumentOnTypeFormatting((params: DocumentOnTypeFormattingParams) => {
  Log.get().info(`Formatting file: ${params.textDocument.uri}`);
  return new Promise((reolve, reject) => {
    const line = params.position.line;
    const column = params.position.character;
    const fullDocument = documents.get(params.textDocument.uri);
    if (fullDocument) {
      const formatter = new CobolFormatter(line, column, fullDocument!);
      switch (true) {
        case hasTypedEnter(params.ch):
          Log.get().info(`Formatting with enter. File: ${params.textDocument.uri}`);
          return reolve(formatter.formatWhenEnterIsPressed());
        case params.ch.toUpperCase() == "E":
          Log.get().info(`Formatting with \"E\". File: ${params.textDocument.uri}`);
          return reolve(formatter.formatWhenEIsPressed());
        case params.ch.toUpperCase() == "N":
          Log.get().info(`Formatting with \"N\". File: ${params.textDocument.uri}`);
          return reolve(formatter.formatWhenNIsPressed());
        default:
          Log.get().error(`Error formatting file: ${params.textDocument.uri}`);
          return reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error formatting"))
      }
    }
    Log.get().error(`Error formatting. fullDocument is undefined. File: ${params.textDocument.uri}`);
    return reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error formatting"))
  });
});

/**
 * Retrun if the character that has been typed is a enter
 *
 * @param ch
 */
export function hasTypedEnter(ch: string) {
  return ch == "\n";
}

connection.onInitialized(() => {
  // Register for all configuration changes.
  connection.client.register(
    DidChangeConfigurationNotification.type,
    undefined
  );
});

connection.onDefinition((params: TextDocumentPositionParams): Thenable<Location | ResponseError<undefined>> => {
  return new Promise((resolve, reject) => {
    const fullDocument = documents.get(params.textDocument.uri);
    if (fullDocument) {
      const text = fullDocument.getText();
      const word = getLineText(text, params.position.line, params.position.character);
      Log.get().info(`Found declaration for ${word} starting`);
      createPromiseForWordDeclaration(text, params.position.line, params.position.character, word, params.textDocument.uri).then((location) => {
        Log.get().info("Found declaration for " + word + " in " + location.uri + ". Key pressed in " + params.textDocument.uri);
        resolve(location);
      }).catch(() => {
        Log.get().warning("Could not find declaration for " + word + ". Key pressed in " + params.textDocument.uri);
        resolve(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to find declaration1"));
      });
    } else {
      Log.get().error("Error to get the fullDocument within onDefinition");
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to find declaration2"));
    }
  })
});

connection.onReferences((params: ReferenceParams): Thenable<Location[] | ResponseError<undefined>> => {
  return new Promise((resolve, reject) => {
    const fullDocument = documents.get(params.textDocument.uri);
    if (fullDocument) {
      const text = fullDocument.getText();
      const word = getLineText(text, params.position.line, params.position.character);
      callCobolReferencesFinder(word, text).then((positions: RechPosition[]) => {
        let locations: Location[] = [];
        positions.forEach((currentPosition) => {
          // If the delcaration was found on an external file
          if (currentPosition.file) {
            // Retrieves the location on the external file
            locations.push(createLocation(currentPosition.file, currentPosition));
          } else {
            // Retrieves the location on the current file
            locations.push(createLocation(params.textDocument.uri, currentPosition));
          }
        })
        resolve(locations);
      }).catch(() => {
          resolve(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to find references1"));
        });
    } else {
      Log.get().error("Error to get the fullDocument within onReferences");
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to find references2"));
    }
  });
});

connection.onRenameRequest((params: RenameParams): Thenable<WorkspaceEdit | ResponseError<undefined>> => {
  return new Promise((resolve, reject) => {
    const fullDocument = documents.get(params.textDocument.uri);
    if (fullDocument) {
      const text = fullDocument.getText();
      const word = getLineText(text, params.position.line, params.position.character);
      callCobolReferencesFinder(word, text).then((positions: RechPosition[]) => {
        const textEdits = RenamingUtils.createEditsFromPositions(positions, word, params.newName);
        resolve({ changes: { [params.textDocument.uri]: textEdits } });
      })
        .catch(() => {
          resolve(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to rename1"));
        });
    } else {
      Log.get().error("Error to get the fullDocument within onRenameRequest");
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to rename2"));
    }
  });

});

connection.onCodeAction((params: CodeActionParams): Thenable<CodeAction[] | ResponseError<undefined>> => {
  return new Promise((resolve, reject) => {
    const fullDocument = documents.get(params.textDocument.uri);
    const diagnostics = params.context.diagnostics;
    if (fullDocument && diagnostics) {
      const range = params.range;
      const uri = params.textDocument.uri;
      const text = fullDocument.getText();
      new CobolActionFactory(range, BufferSplitter.split(text), uri)
        .generateActions(diagnostics)
        .then((actions) => {
          resolve(actions);
        }).catch(() => {
          reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to provide onCodeAction inside CobolActionFactory"));
        });
    } else {
      Log.get().error("Error to get the fullDocument within onCodeAction");
      reject(new ResponseError<undefined>(ErrorCodes.RequestCancelled, "Error to provide onCodeAction because some information is undefined"));
    }
  });
});


// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);
// Listen on the connection
connection.listen();

// This handler resolve additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
  (item: CompletionItem): CompletionItem => {
    return item;
  }
);

/**
 * Returns the specified line within the document text
 *
 * @param documentText document text
 * @param line line
 * @param column column
 */
export function getLineText(
  documentText: string,
  line: number,
  column: number
) {
  const currentLine = BufferSplitter.split(documentText)[line];
  return new CobolWordFinder().findWordAt(currentLine, column);
}

/**
 * Creates a promise to find the specified word declaration
 *
 * @param documentFullText full text of the current document
 * @param word the target word which declaration will be searched
 * @param uri URI of the current file open in editor
 */
export function createPromiseForWordDeclaration(documentFullText: string, referenceLine: number, referenceColumn: number, word: string, uri: string) {
  // Creates an external promise so the reject function can be called when no definition
  // is found for the specified word
  return new Promise<Location>((resolve, reject) => {
    callCobolDeclarationFinder(word, referenceLine, referenceColumn, documentFullText, uri).then((position) => {
      // If the delcaration was found on an external file
      if (position.file) {
        // Retrieves the location on the external file
        resolve(createLocation(position.file, position));
      } else {
        // Retrieves the location on the current file
        resolve(createLocation(uri, position));
      }
    })
      .catch(() => {
        reject();
      });
  });
}

/**
 * Call the cobol word declaration finder
 *
 * @param word
 * @param documentFullText
 * @param uri
 */
export function callCobolDeclarationFinder(word: string, referenceLine: number, referenceColumn: number, documentFullText: string, uri: string): Promise<RechPosition> {
  return new Promise((resolve, reject) => {
    new CobolDeclarationFinder(documentFullText)
      .findDeclaration({
        term: word,
        uri: uri,
        lineIndex: referenceLine,
        columnIndex: referenceColumn
      })
      .then((position: RechPosition) => {
        return resolve(position);
      }).catch(() => {
        reject();
      })
  })
}

/**
 * Call the cobol word references finder
 *
 * @param word
 * @param documentFullText
 * @param uri
 */
export function callCobolReferencesFinder(word: string, documentFullText: string): Promise<RechPosition[]> {
  return new Promise((resolve, reject) => {
    new CobolReferencesFinder(documentFullText)
      .findReferences(word)
      .then((positions: RechPosition[]) => {
        return resolve(positions);
      }).catch(() => {
        reject();
      })
  });
}

/**
 * Builds Cobol preprocessor cache filename
 *
 * @param uri current URI of the file open in editor
 */
export function buildCacheFileName(uri: string) {
  const path = new Path(uri).fullPathWin();
  return "C:\\TMP\\PREPROC\\" + require("os").userInfo().username.toLowerCase() + "\\" + new Path(path).fileName();
}

/**
 * Sends a request to the client for Cobol preprocessor execution
 *
 * @param uri current URI of the file open in editor
 * @param cacheFileName Cache filename where the declaration is searched before
 * invoking Cobol preprocessor
 */
export function sendExternalPreprocExpanderExecution(
  uri: string,
  cacheFileName: string
) {
  const files = [uri, cacheFileName];
  return connection.sendRequest("custom/runPreprocExpander", [files]);
}

/**
 * Creates a location with the specified uri and position
 *
 * @param uri
 * @param position
 */
export function createLocation(uri: string, position: RechPosition) {
  const firstCharRange = Range.create(
    Position.create(position.line, position.column),
    Position.create(position.line, position.column)
  );
  const fileUri = normalizeUri(uri);
  return Location.create(fileUri, firstCharRange);
}

/**
 * Normalizes the specified URI to be understood by VSCode API
 *
 * @param uri URI to be normalized
 */
export function normalizeUri(uri: string) {
  // First, convert backslashes into slashes
  let normalized: string = uri.replace(/\\\\/g, "/");
  // When the URI does not start with 'file://' we need to add it
  if (!normalized.startsWith("file://")) {
    normalized = normalized.replace("F:", "file:///F%3A");
  }
  return normalized;
}

/**
 * Configures the server logger instance
 */
export function configureServerLog() {
  return new Promise((resolve, reject) => {
    if (loggingConfigured) {
      return resolve(undefined);
    }
    getConfig<boolean>("log").then((loggingActive) => {
      if (loggingActive) {
        Log.get().setActive(true);
      }
    }).catch(() => {
      return reject();
    });
    loggingConfigured = true;
    return resolve(undefined);
  })
}
