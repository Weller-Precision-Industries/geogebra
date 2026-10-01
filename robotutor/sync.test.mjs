// Local tests for sync.mjs with disposable Git repositories: no network, GitHub or JDK needed.
//   node --test robotutor/sync.test.mjs
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BASE, HEAD, checkedSha, prepareMerge, run } from "./sync.mjs";

function fixture(t) {
	const root = mkdtempSync(join(tmpdir(), "geogebra-sync-test-"));
	t.after(() => rmSync(root, { recursive: true, force: true }));
	const git = (cwd, ...args) => run("git", args, { cwd });
	const identity = (cwd) => {
		git(cwd, "config", "user.name", "Test");
		git(cwd, "config", "user.email", "test@example.invalid");
	};
	const upstream = join(root, "upstream");
	mkdirSync(upstream);
	git(upstream, "init", "-b", "main");
	identity(upstream);
	writeFileSync(join(upstream, "Kernel.java"), "class Kernel {}\n");
	git(upstream, "add", ".");
	git(upstream, "commit", "-m", "upstream initial");
	const origin = join(root, "origin.git");
	run("git", ["clone", "--bare", upstream, origin]);
	const repo = join(root, "repo");
	run("git", ["clone", origin, repo]);
	identity(repo);
	git(repo, "checkout", "-b", BASE);
	mkdirSync(join(repo, "robotutor"));
	writeFileSync(join(repo, "robotutor", "upstream.json"), "{}\n");
	writeFileSync(join(repo, "ROBOTUTOR.md"), "fork patches\n");
	git(repo, "add", ".");
	git(repo, "commit", "-m", "Robotutor patch");
	git(repo, "push", "origin", BASE);
	const change = (name, text) => {
		writeFileSync(join(upstream, name), text);
		git(upstream, "add", ".");
		git(upstream, "commit", "-m", `upstream ${name}`);
		return git(upstream, "rev-parse", "HEAD");
	};
	let n = 0;
	const work = () => join(root, `work-${n++}`);
	return { repo, upstream, origin, git, change, work };
}

test("rejects anything but an exact commit SHA", () => {
	checkedSha("a".repeat(40));
	for (const value of ["main", "-f", "a".repeat(39), "$(id)", "A".repeat(40)]) assert.throws(() => checkedSha(value));
});

test("reports no change when the fork already contains upstream", (t) => {
	const f = fixture(t);
	const result = prepareMerge(f.repo, f.work(), { upstreamUrl: f.upstream });
	assert.equal(result.changed, false);
});

test("merges upstream, keeps the fork's files and records the upstream commit", (t) => {
	const f = fixture(t);
	const upstreamSha = f.change("Kernel.java", "class Kernel { int v; }\n");
	const work = f.work();
	const result = prepareMerge(f.repo, work, { upstreamUrl: f.upstream });
	assert.equal(result.changed, true);
	assert.equal(readFileSync(join(work, "Kernel.java"), "utf8"), "class Kernel { int v; }\n");
	assert.equal(readFileSync(join(work, "ROBOTUTOR.md"), "utf8"), "fork patches\n");
	assert.equal(JSON.parse(readFileSync(join(work, "robotutor", "upstream.json"), "utf8")).sha, upstreamSha);
	// Both histories survive: the fork commit and the upstream commit are ancestors of the candidate.
	f.git(work, "merge-base", "--is-ancestor", result.baseSha, result.sha);
	f.git(work, "merge-base", "--is-ancestor", upstreamSha, result.sha);
	// Nothing was pushed by preparing.
	assert.equal(f.git(f.repo, "ls-remote", "--heads", "origin", HEAD), "");
});

test("builds on an existing proposal branch instead of rewriting it", (t) => {
	const f = fixture(t);
	f.change("A.java", "a\n");
	const first = f.work();
	const proposal = prepareMerge(f.repo, first, { upstreamUrl: f.upstream });
	f.git(first, "push", "origin", `HEAD:refs/heads/${HEAD}`);
	f.change("B.java", "b\n");
	const second = f.work();
	const next = prepareMerge(f.repo, second, { upstreamUrl: f.upstream });
	assert.equal(next.previous, true);
	f.git(second, "merge-base", "--is-ancestor", proposal.sha, next.sha);
	// A fast-forward of the proposal branch: the push needs no force.
	f.git(second, "push", "origin", `HEAD:refs/heads/${HEAD}`);
});

test("stops on conflict, names the paths and leaves nothing half-merged", (t) => {
	const f = fixture(t);
	writeFileSync(join(f.repo, "Kernel.java"), "class Kernel { /* fork */ }\n");
	f.git(f.repo, "commit", "-am", "fork edit");
	f.git(f.repo, "push", "origin", BASE);
	f.change("Kernel.java", "class Kernel { /* upstream */ }\n");
	const work = f.work();
	assert.throws(() => prepareMerge(f.repo, work, { upstreamUrl: f.upstream }), /Conflicts:\nKernel\.java/);
	assert.equal(f.git(work, "status", "--porcelain"), "");
	assert.equal(f.git(f.repo, "ls-remote", "--heads", "origin", HEAD), "");
});
