"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const exfs = require("./fs");
const path = require("path");
const util = require("./util");
const yazl = require("yazl");
const fs_1 = require("fs");
const cancelable_1 = require("./cancelable");
/**
 * Compress files or folders to a zip file.
 */
class Zip extends cancelable_1.Cancelable {
    /**
     *
     */
    constructor(options) {
        super();
        this.options = options;
        this.isPipe = false;
        this.zipFiles = [];
        this.zipFolders = [];
    }
    /**
     * Adds a file from the file system at realPath into the zipfile as metadataPath.
     * @param file
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    addFile(file, metadataPath, options) {
        let mpath = metadataPath;
        if (!mpath) {
            mpath = path.basename(file);
        }
        this.zipFiles.push({
            path: file,
            metadataPath: mpath,
            options
        });
    }
    onDataCallback(data) {
        if (this.options && this.options.onData) {
            this.options.onData(data);
        }
    }
    /**
     * Adds a folder from the file system at realPath into the zipfile as metadataPath.
     * @param folder
     * @param metadataPath Typically metadataPath would be calculated as path.relative(root, realPath).
     * A valid metadataPath must not start with "/" or /[A-Za-z]:\//, and must not contain "..".
     */
    addFolder(folder, metadataPath, options) {
        this.zipFolders.push({
            path: folder,
            metadataPath: metadataPath,
            options
        });
    }
    /**
     * Generate zip file.
     * @param zipFile the zip file path.
     */
    async archive(zipFile) {
        if (!zipFile) {
            return Promise.reject(new Error("zipPath must not be empty"));
        }
        this.isCanceled = false;
        this.isPipe = false;
        // Re-instantiate yazl every time the archive method is called to ensure that files are not added repeatedly.
        // This will also make the Zip class reusable.
        this.initYazl();
        return new Promise(async (c, e) => {
            this.yazlErrorCallback = (err) => {
                this.yazlErrorCallback = undefined;
                e(err);
            };
            const zip = this.yazlFile;
            try {
                const files = this.zipFiles;
                for (let fi = 0; fi < files.length; fi++) {
                    const file = files[fi];
                    await this.addFileOrSymlink(zip, file.path, file.metadataPath, file.options);
                }
                if (this.zipFolders.length > 0) {
                    await this.walkDir(this.zipFolders);
                }
                await exfs.ensureFolder(path.dirname(zipFile));
            }
            catch (error) {
                e(this.wrapError(error));
                return;
            }
            zip.end();
            if (!this.isCanceled) {
                this.zipStream = fs_1.createWriteStream(zipFile);
                this.zipStream.once("data", this.onDataCallback);
                this.zipStream.once("error", err => {
                    e(this.wrapError(err));
                });
                this.zipStream.once("close", () => {
                    if (this.isCanceled) {
                        e(this.canceledError());
                    }
                    else {
                        c(void 0);
                    }
                });
                zip.outputStream.once("error", err => {
                    e(this.wrapError(err));
                });
                zip.outputStream.pipe(this.zipStream);
                this.isPipe = true;
            }
        });
    }
    /**
     * Cancel compression.
     * If the cancel method is called after the archive is complete, nothing will happen.
     */
    cancel() {
        super.cancel();
        this.stopPipe(this.canceledError());
    }
    initYazl() {
        this.yazlFile = new yazl.ZipFile();
        this.yazlFile.once("error", (err) => {
            this.stopPipe(this.wrapError(err));
        });
    }
    async addFileOrSymlink(zip, file, metadataPath, options) {
        if (this.followSymlink()) {
            zip.addFile(file, metadataPath, options);
        }
        else {
            const stat = await util.lstat(file);
            const entry = {
                path: file,
                type: "file",
                mtime: stat.mtime,
                mode: stat.mode
            };
            if (stat.isSymbolicLink()) {
                await this.addSymlink(zip, entry, metadataPath, options);
            }
            else {
                this.addFileStream(zip, entry, metadataPath, options);
            }
        }
    }
    addFileStream(zip, file, metadataPath, options) {
        const fileStream = fs_1.createReadStream(file.path);
        fileStream.once("data", this.onDataCallback);
        fileStream.once("error", err => {
            this.stopPipe(this.wrapError(err));
        });
        // If the file attribute is known, add the entry using `addReadStream`,
        // this can reduce the number of calls to the `fs.stat` method.
        const newOptions = Object.assign(Object.assign({}, options), { mode: file.mode, mtime: file.mtime });
        zip.addReadStream(fileStream, metadataPath, newOptions);
    }
    async addSymlink(zip, file, metadataPath, options) {
        const linkTarget = await util.readlink(file.path);
        const newOptions = Object.assign(Object.assign({}, options), { mode: file.mode, mtime: file.mtime });
        zip.addBuffer(Buffer.from(linkTarget), metadataPath, newOptions);
    }
    async walkDir(folders) {
        for (let fi = 0; fi < folders.length; fi++) {
            if (this.isCanceled) {
                return;
            }
            const folder = folders[fi];
            const entries = await exfs.readdirp(folder.path);
            if (entries.length > 0) {
                for (let ei = 0; ei < entries.length; ei++) {
                    const entry = entries[ei];
                    if (this.isCanceled) {
                        return;
                    }
                    const relativePath = path.relative(folder.path, entry.path);
                    const metadataPath = folder.metadataPath
                        ? path.join(folder.metadataPath, relativePath)
                        : relativePath;
                    if (entry.type === "dir") {
                        this.yazlFile.addEmptyDirectory(metadataPath, {
                            mtime: entry.mtime,
                            mode: entry.mode
                        });
                    }
                    else if (entry.type === "symlink" &&
                        !this.followSymlink()) {
                        await this.addSymlink(this.yazlFile, entry, metadataPath, folder.options);
                    }
                    else {
                        this.addFileStream(this.yazlFile, entry, metadataPath, folder.options);
                    }
                }
            }
            else {
                // If the folder is empty and the metadataPath has a value,
                // an empty folder should be created based on the metadataPath
                if (folder.metadataPath) {
                    this.yazlFile.addEmptyDirectory(folder.metadataPath);
                }
            }
        }
    }
    stopPipe(err) {
        if (this.yazlErrorCallback) {
            this.yazlErrorCallback(err);
        }
        if (this.isPipe) {
            this.yazlFile.outputStream.unpipe(this.zipStream);
            this.zipStream.destroy(err);
            this.isPipe = false;
        }
    }
    followSymlink() {
        let followSymlink = false;
        if (this.options && this.options.followSymlinks === true) {
            followSymlink = true;
        }
        return followSymlink;
    }
}
exports.Zip = Zip;
//# sourceMappingURL=zip.js.map