"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exfs = require("./fs");
const path = require("path");
const util = require("./util");
const yauzl = require("yauzl");
const fs_1 = require("fs");
const cancelable_1 = require("./cancelable");
class EntryEvent {
    /**
     *
     */
    constructor(_entryCount) {
        this._entryCount = _entryCount;
        this._isPrevented = false;
    }
    get entryName() {
        return this._entryName;
    }
    set entryName(name) {
        this._entryName = name;
    }
    get entryCount() {
        return this._entryCount;
    }
    get isPrevented() {
        return this._isPrevented;
    }
    preventDefault() {
        this._isPrevented = true;
    }
    reset() {
        this._isPrevented = false;
    }
}
/**
 * Extract the zip file.
 */
class Unzip extends cancelable_1.Cancelable {
    /**
     *
     */
    constructor(options) {
        super();
        this.options = options;
    }
    /**
     * Extract the zip file to the specified location.
     * @param zipFile
     * @param targetFolder
     * @param options
     */
    async extract(zipFile, targetFolder) {
        let extractedEntriesCount = 0;
        this.isCanceled = false;
        if (this.isOverwrite()) {
            await exfs.rimraf(targetFolder);
        }
        if (this.isCanceled) {
            return Promise.reject(this.canceledError());
        }
        await exfs.ensureFolder(targetFolder);
        const zfile = await this.openZip(zipFile);
        this.zipFile = zfile;
        zfile.readEntry();
        return new Promise((c, e) => {
            const total = zfile.entryCount;
            zfile.once("error", err => {
                e(this.wrapError(err));
            });
            zfile.once("close", () => {
                if (this.isCanceled) {
                    e(this.canceledError());
                }
                // If the zip content is empty, it will not receive the `zfile.on("entry")` event.
                else if (total === 0) {
                    c(void 0);
                }
            });
            // Because openZip is an asynchronous method, openZip may not be completed when calling cancel,
            // so we need to check if it has been canceled after the openZip method returns.
            if (this.isCanceled) {
                this.closeZip();
                return;
            }
            const entryEvent = new EntryEvent(total);
            zfile.on("entry", async (entry) => {
                // use UTF-8 in all situations
                // see https://github.com/thejoshwolfe/yauzl/issues/84
                const rawName = entry.fileName.toString("utf8");
                // allow backslash
                const fileName = rawName.replace(/\\/g, "/");
                // Because `decodeStrings` is `false`, we need to manually verify the entryname
                // see https://github.com/thejoshwolfe/yauzl#validatefilenamefilename
                const errorMessage = yauzl.validateFileName(fileName);
                if (errorMessage != null) {
                    e(new Error(errorMessage));
                    this.closeZip();
                    return;
                }
                entryEvent.entryName = fileName;
                this.onEntryCallback(entryEvent);
                try {
                    if (entryEvent.isPrevented) {
                        entryEvent.reset();
                        zfile.readEntry();
                    }
                    else {
                        await this.handleEntry(zfile, entry, fileName, targetFolder);
                    }
                    extractedEntriesCount++;
                    if (extractedEntriesCount === total) {
                        c();
                    }
                }
                catch (error) {
                    e(this.wrapError(error));
                    this.closeZip();
                }
            });
        });
    }
    /**
     * Cancel decompression.
     * If the cancel method is called after the extract is complete, nothing will happen.
     */
    cancel() {
        super.cancel();
        if (this.cancelCallback) {
            this.cancelCallback(this.canceledError());
        }
        this.closeZip();
    }
    closeZip() {
        if (this.zipFile) {
            this.zipFile.close();
            this.zipFile = null;
        }
    }
    openZip(zipFile) {
        return new Promise((c, e) => {
            yauzl.open(zipFile, {
                lazyEntries: true,
                // see https://github.com/thejoshwolfe/yauzl/issues/84
                decodeStrings: false
            }, (err, zfile) => {
                if (err) {
                    e(this.wrapError(err));
                }
                else {
                    c(zfile);
                }
            });
        });
    }
    async handleEntry(zfile, entry, decodeEntryFileName, targetPath) {
        if (/\/$/.test(decodeEntryFileName)) {
            // Directory file names end with '/'.
            // Note that entires for directories themselves are optional.
            // An entry's fileName implicitly requires its parent directories to exist.
            await exfs.ensureFolder(path.join(targetPath, decodeEntryFileName));
            zfile.readEntry();
        }
        else {
            // file entry
            await this.extractEntry(zfile, entry, decodeEntryFileName, targetPath);
        }
    }
    openZipFileStream(zfile, entry) {
        return new Promise((c, e) => {
            zfile.openReadStream(entry, (err, readStream) => {
                if (err) {
                    e(this.wrapError(err));
                }
                else {
                    c(readStream);
                }
            });
        });
    }
    async extractEntry(zfile, entry, decodeEntryFileName, targetPath) {
        const filePath = path.join(targetPath, decodeEntryFileName);
        await exfs.ensureFolder(path.dirname(filePath));
        const readStream = await this.openZipFileStream(zfile, entry);
        readStream.on("data", this.onDataCallback);
        readStream.on("end", () => {
            zfile.readEntry();
        });
        await this.writeEntryToFile(readStream, entry, filePath);
    }
    async writeEntryToFile(readStream, entry, filePath) {
        let fileStream;
        this.cancelCallback = err => {
            this.cancelCallback = undefined;
            if (fileStream) {
                readStream.unpipe(fileStream);
                fileStream.destroy(err);
            }
        };
        return new Promise(async (c, e) => {
            try {
                const mode = this.modeFromEntry(entry);
                // see https://unix.stackexchange.com/questions/193465/what-file-mode-is-a-symlink
                const isSymlink = (mode & 0o170000) === 0o120000;
                readStream.once("error", err => {
                    e(this.wrapError(err));
                });
                if (isSymlink && !this.symlinkToFile()) {
                    let linkContent = "";
                    readStream.on("data", (chunk) => {
                        if (chunk instanceof String) {
                            linkContent += chunk;
                        }
                        else {
                            linkContent += chunk.toString();
                        }
                    });
                    readStream.once("end", () => {
                        this.createSymlink(linkContent, filePath).then(c, e);
                    });
                }
                else {
                    fileStream = fs_1.createWriteStream(filePath, { mode });
                    fileStream.once("close", () => c());
                    fileStream.once("error", err => {
                        e(this.wrapError(err));
                    });
                    readStream.pipe(fileStream);
                }
            }
            catch (error) {
                e(this.wrapError(error));
            }
        });
    }
    modeFromEntry(entry) {
        const attr = entry.externalFileAttributes >> 16 || 33188;
        return [448 /* S_IRWXU */, 56 /* S_IRWXG */, 7 /* S_IRWXO */]
            .map(mask => attr & mask)
            .reduce((a, b) => a + b, attr & 61440 /* S_IFMT */);
    }
    async createSymlink(linkContent, des) {
        await util.symlink(linkContent, des);
    }
    isOverwrite() {
        if (this.options && this.options.overwrite) {
            return true;
        }
        return false;
    }
    onEntryCallback(event) {
        if (this.options && this.options.onEntry) {
            this.options.onEntry(event);
        }
    }
    onDataCallback(data) {
        if (this.options && this.options.onData) {
            this.options.onData(data);
        }
    }
    symlinkToFile() {
        let symlinkToFile = false;
        if (process.platform === "win32") {
            if (this.options && this.options.symlinkAsFileOnWindows === false) {
                symlinkToFile = false;
            }
            else {
                symlinkToFile = true;
            }
        }
        return symlinkToFile;
    }
}
exports.Unzip = Unzip;
//# sourceMappingURL=unzip.js.map