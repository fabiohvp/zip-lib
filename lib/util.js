"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs = require("fs");
const util = require("util");
function unlink(path) {
    return util.promisify(fs.unlink)(path);
}
exports.unlink = unlink;
function mkdir(path, mode) {
    return util.promisify(fs.mkdir)(path, mode);
}
exports.mkdir = mkdir;
function lstat(path) {
    return util.promisify(fs.lstat)(path);
}
exports.lstat = lstat;
function chmod(path, mode) {
    return util.promisify(fs.chmod)(path, mode);
}
exports.chmod = chmod;
function readdir(path) {
    return util.promisify(fs.readdir)(path);
}
exports.readdir = readdir;
function access(path, mode) {
    return util.promisify(fs.access)(path, mode);
}
exports.access = access;
function rmdir(path) {
    return util.promisify(fs.rmdir)(path);
}
exports.rmdir = rmdir;
function symlink(target, path) {
    return util.promisify(fs.symlink)(target, path);
}
exports.symlink = symlink;
function readlink(path) {
    return util.promisify(fs.readlink)(path);
}
exports.readlink = readlink;
//# sourceMappingURL=util.js.map