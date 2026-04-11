const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function isCrossDeviceError(error) {
    const code = String(error?.code || '').toUpperCase();
    return code === 'EXDEV' || code === 'EBUSY' || code === 'EPERM';
}

function isPathInside(parentPath, candidatePath) {
    const parent = path.resolve(parentPath);
    const candidate = path.resolve(candidatePath);
    if (parent === candidate) return true;
    return candidate.startsWith(parent + path.sep);
}

function samePath(a, b) {
    return path.resolve(a || '') === path.resolve(b || '');
}

function uniqueArchivePath(archiveDir, baseName) {
    const safeBase = path.basename(String(baseName || 'legacy'));
    const firstTarget = path.join(archiveDir, safeBase);
    if (!fs.existsSync(firstTarget)) return firstTarget;
    const parsed = path.parse(safeBase);
    return path.join(archiveDir, `${parsed.name}_${Date.now()}${parsed.ext}`);
}

function removePathBestEffort(targetPath) {
    if (!targetPath || !fs.existsSync(targetPath)) return;
    try {
        fs.rmSync(targetPath, { recursive: true, force: true });
    } catch (_) {}
}

function copyPathSync(srcPath, destPath) {
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
        ensureDir(destPath);
        const entries = fs.readdirSync(srcPath);
        for (const entry of entries) {
            copyPathSync(path.join(srcPath, entry), path.join(destPath, entry));
        }
        return;
    }

    ensureDir(path.dirname(destPath));
    fs.copyFileSync(srcPath, destPath);
}

function movePathSync(srcPath, destPath) {
    ensureDir(path.dirname(destPath));
    try {
        fs.renameSync(srcPath, destPath);
        return;
    } catch (error) {
        if (!isCrossDeviceError(error)) throw error;
    }

    copyPathSync(srcPath, destPath);
    removePathBestEffort(srcPath);
}

function archiveLegacyPath(srcPath, archiveDir) {
    if (!srcPath || !fs.existsSync(srcPath)) return null;
    ensureDir(archiveDir);
    const target = uniqueArchivePath(archiveDir, path.basename(srcPath));
    movePathSync(srcPath, target);
    return target;
}

function moveLegacyPath(srcPath, destPath, archiveDir) {
    if (!srcPath || !destPath || !fs.existsSync(srcPath) || samePath(srcPath, destPath)) return;
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
        ensureDir(destPath);
        const entries = fs.readdirSync(srcPath);
        for (const entry of entries) {
            moveLegacyPath(path.join(srcPath, entry), path.join(destPath, entry), archiveDir);
        }
        if (fs.existsSync(srcPath) && fs.readdirSync(srcPath).length === 0) {
            fs.rmdirSync(srcPath);
        } else if (fs.existsSync(srcPath)) {
            archiveLegacyPath(srcPath, archiveDir);
        }
        return;
    }

    ensureDir(path.dirname(destPath));
    if (!fs.existsSync(destPath)) {
        movePathSync(srcPath, destPath);
        return;
    }
    archiveLegacyPath(srcPath, archiveDir);
}

function bootstrapDataRootLayout({
    dirsToEnsure = [],
    skipRuntimeMigration = false,
    dataRootDir,
    rootDir,
    legacyRuntimeArchiveDir,
    legacyMappings = []
}) {
    dirsToEnsure.forEach(ensureDir);
    if (skipRuntimeMigration) return;
    if (samePath(dataRootDir, rootDir)) return;

    for (const item of legacyMappings) {
        try {
            moveLegacyPath(item.src, item.dest, legacyRuntimeArchiveDir);
        } catch (error) {
            console.error('[system] falha ao migrar runtime legado:', item.src, error?.message || error);
        }
    }
}

function normalizeSafePublicPath(rawPath) {
    if (!rawPath || typeof rawPath !== 'string') return null;
    let decoded = rawPath;
    try { decoded = decodeURIComponent(rawPath); } catch (_) {}
    const normalized = decoded.replace(/\\/g, '/').replace(/^\/+/, '').trim();
    if (!normalized || normalized.includes('\0')) return null;
    if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
    return normalized;
}

function getSafeFilename(rawName, allowedExtensions = []) {
    const trimmed = String(rawName || '').trim();
    if (!trimmed) return null;
    if (trimmed.includes('/') || trimmed.includes('\\')) return null;
    const safeName = path.basename(trimmed);
    if (!safeName || safeName !== trimmed) return null;
    const ext = path.extname(safeName).toLowerCase();
    if (allowedExtensions.length && !allowedExtensions.includes(ext)) return null;
    return safeName;
}

function resolvePublicMediaPath({ requestPath, rootDir, publicAssetsDir, publicMediaFileMap }) {
    const safePath = normalizeSafePublicPath(requestPath);
    if (!safePath) return null;
    const exactFile = publicMediaFileMap.get(safePath);
    if (exactFile && fs.existsSync(exactFile)) return exactFile;
    if (!safePath.startsWith('assets/')) return null;
    const fullPath = path.resolve(rootDir, safePath);
    if (!isPathInside(publicAssetsDir, fullPath)) return null;
    if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) return null;
    return fullPath;
}

function sendSafeStaticFile(res, filePath, cacheControl = 'public, max-age=86400') {
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.sendFile(filePath);
}

module.exports = {
    ensureDir,
    isPathInside,
    samePath,
    archiveLegacyPath,
    bootstrapDataRootLayout,
    getSafeFilename,
    resolvePublicMediaPath,
    sendSafeStaticFile
};
