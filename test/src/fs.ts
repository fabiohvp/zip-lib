import * as exfs from "../../lib/fs"
import * as path from "path";
import * as assert from "assert";

describe("fs helper", () => {
    describe("isRootPath", () => {
        it("d", () => {
            assert.equal(exfs.isRootPath("d"), false);
        });
        it("/", () => {
            assert.equal(exfs.isRootPath("/"), true);
        });
        it("\\", () => {
            assert.equal(exfs.isRootPath("\\"), true);
        });
        it("\\test", () => {
            assert.equal(exfs.isRootPath("\\test"), false);
        });
        it("/test", () => {
            assert.equal(exfs.isRootPath("/test"), false);
        });
        it("d:", () => {
            if (process.platform === "win32") {
                assert.equal(exfs.isRootPath("d:"), true);
            } else {
                assert.equal(exfs.isRootPath("d:"), false);
            }
        });
        it("D:", () => {
            if (process.platform === "win32") {
                assert.equal(exfs.isRootPath("D:"), true);
            } else {
                assert.equal(exfs.isRootPath("D:"), false);
            }
        });
        it("d:/", () => {
            if (process.platform === "win32") {
                assert.equal(exfs.isRootPath("d:/"), true);
            } else {
                assert.equal(exfs.isRootPath("d:/"), false);
            }
        });
        it("D:/", () => {
            if (process.platform === "win32") {
                assert.equal(exfs.isRootPath("D:/"), true);
            } else {
                assert.equal(exfs.isRootPath("D:/"), false);
            }
        });
        it("D:/test", () => {
            assert.equal(exfs.isRootPath("D:/test"), false);
        });
        it("dd:", () => {
            assert.equal(exfs.isRootPath("dd:"), false);
        });
    });

    describe("pathExists", () => {
        let target1 = path.join(__dirname, "../resources");
        it(target1, async () => {
            const exist = await exfs.pathExists(target1);
            assert.equal(exist, true);
        });
        let target2 = path.join(__dirname, "../asdfasdfa");
        it(target2, async () => {
            const exist = await exfs.pathExists(target2);
            assert.equal(exist, false);
        });
        let target3 = path.join(__dirname, "../resources/¹ º » ¼ ½ ¾.txt")
        it(target3, async () => {
            const exist = await exfs.pathExists(target3);
            assert.equal(exist, true);
        });
    })

    describe("readdirp", () => {
        let target1 = path.join(__dirname, "../resources");
        it(target1, async () => {
            const files = await exfs.readdirp(target1);
            const symlinkExist = await exfs.pathExists(path.join(target1, "symlink"));
            let exceptedFiles: string[] = [];
            exceptedFiles.push(path.join(target1, "«ταБЬℓσ»"));
            exceptedFiles.push(path.join(target1, "name with space/empty folder"));
            exceptedFiles.push(path.join(target1, "subfolder/test text.txt"));
            exceptedFiles.push(path.join(target1, "subfolder/test.txt"));
            exceptedFiles.push(path.join(target1, "subfolder/test.txt - shortcut.lnk"));
            exceptedFiles.push(path.join(target1, "¹ º » ¼ ½ ¾.txt"));
            exceptedFiles.push(path.join(target1, "src - shortcut.lnk"));
            if (symlinkExist) {
                exceptedFiles.push(path.join(target1, "symlink"));
                if (files.length !== 8) {
                    assert.fail(`files length is ${files.length}, excepted value is 8`);
                }
            } else {
                if (files.length !== 7) {
                    assert.fail(`files length is ${files.length}, excepted value is 7`);
                }
            }
            files.forEach(item => {
                if (exceptedFiles.indexOf(item.path) < 0) {
                    assert.fail(`${item.path} is not an excepted value`);
                }
            });
        });
    })

    describe("ensureFolder", () => {
        let target1 = path.join(__dirname, "../unzips/test/sub folder/sub");
        it(target1, async () => {
            await exfs.ensureFolder(target1);
            const exist = await exfs.pathExists(target1);
            assert.equal(exist, true);
        });
        let target2 = "/";
        it(target2, async () => {
            const rootExist = await exfs.pathExists(target2);
            await exfs.ensureFolder(target2);
            const exist = await exfs.pathExists(target2);
            assert.equal(exist, rootExist);
        });
        if (process.platform === "win32") {
            let target3 = "D:";
            it(target3, async () => {
                const rootExist = await exfs.pathExists(target3);
                await exfs.ensureFolder(target3);
                const exist = await exfs.pathExists(target3);
                assert.equal(exist, rootExist);
            });
            let target4 = "E:/";
            it(target4, async () => {
                const rootExist = await exfs.pathExists(target4);
                await exfs.ensureFolder(target4);
                const exist = await exfs.pathExists(target4);
                assert.equal(exist, rootExist);
            });
            let target5 = "z:";
            it(target5, async () => {
                const rootExist = await exfs.pathExists(target5);
                await exfs.ensureFolder(target5);
                const exist = await exfs.pathExists(target5);
                assert.equal(exist, rootExist);
            });
        }
        let target6 = path.join(__dirname, "../unzips/test/sub folder/test:");
        it(target6, async () => {
            try {
                await exfs.ensureFolder(target6);
                const exist = await exfs.pathExists(target6);
                if (process.platform === "win32") {
                    assert.fail(`"${target6}" should be an invalid name on windows`);
                } else {
                    assert.equal(exist, true);
                }
            } catch (error) {
                if (process.platform === "win32") {
                    assert.ok(true);
                } else {
                    assert.fail(error);
                }
            }
        });
    })

    describe("rimraf", () => {
        let target1 = path.join(__dirname, "../unzips/test2/sub folder/sub");
        it(target1, async () => {
            await exfs.ensureFolder(target1);
            const target1Root = path.join(__dirname, "../unzips/test2");
            await exfs.rimraf(target1Root);
            const exist = await exfs.pathExists(target1Root);
            assert.equal(exist, false);
        });
        let target2 = path.join(__dirname, "../unzips/test3/sub folder/sub");
        it(target2, async () => {
            await exfs.rimraf(target2);
            const exist = await exfs.pathExists(target2);
            assert.equal(exist, false);
        });
        let target3 = "z:";
        it(target3, async () => {
            try {
                await exfs.rimraf(target3);
                if (process.platform === "win32") {
                    assert.fail(`Should refuse to recursively delete ${target3}`);
                } else {
                    assert.ok(true);
                }
            } catch (error) {
                if (process.platform === "win32") {
                    assert.equal(error.message === `Refuse to recursively delete root, path: "${target3}"`, true);
                } else {
                    assert.fail(error);
                }
            }
        });
    })
});