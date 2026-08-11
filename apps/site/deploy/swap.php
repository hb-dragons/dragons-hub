<?php
$secret = trim(@file_get_contents('/usr/home/hbdrag/.deploy_secret') ?: '');
$given  = $_SERVER['HTTP_X_DEPLOY_TOKEN'] ?? '';
if ($secret === '' || !hash_equals($secret, $given)) { http_response_code(403); exit('forbidden'); }

$sha = $_POST['sha'] ?? '';
if (!preg_match('/^[0-9a-f]{7,40}$/', $sha)) { http_response_code(400); exit('bad sha'); }
$target = "releases/$sha";
if (!is_dir(__DIR__ . "/$target")) { http_response_code(404); exit('unknown release'); }

// atomic: build aside, rename over (rename() over an existing symlink is atomic — verified on this host)
@unlink(__DIR__ . '/current.new');
if (!symlink($target, __DIR__ . '/current.new') || !rename(__DIR__ . '/current.new', __DIR__ . '/current')) {
    http_response_code(500); exit('swap failed');
}

// prune: keep newest 5 releases, never the live one
function rrmdir(string $dir): void {
    foreach (new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, FilesystemIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        $f->isDir() ? rmdir($f->getPathname()) : unlink($f->getPathname());
    }
    rmdir($dir);
}
$releases = glob(__DIR__ . '/releases/*', GLOB_ONLYDIR);
usort($releases, fn($a, $b) => filemtime($b) <=> filemtime($a));
foreach (array_slice($releases, 5) as $old) {
    if (basename($old) !== $sha) rrmdir($old);
}
echo "ok $sha";
