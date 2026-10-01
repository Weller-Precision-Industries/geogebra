// Robotutor contract (Linear OLM-2025): every GeoGebra behaviour OLMS relies on, checked
// against a built bundle served the way OLMS serves it (see server.mjs). Run after each
// upstream merge, before publishing a release. The bundle is ROBOTUTOR_BUNDLE (an unpacked
// geogebra-web3d-<commit> directory) or the one robotutor/package-web3d.sh staged for HEAD.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { startServer } from "./server.mjs";

const repo = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const bundleDir = resolve(
	process.env.ROBOTUTOR_BUNDLE ??
		join(
			repo,
			"dist",
			`geogebra-web3d-${execFileSync("git", ["-C", repo, "rev-parse", "--short=12", "HEAD"], { encoding: "utf8" }).trim()}`,
		),
);
const commit = basename(bundleDir).replace(/^geogebra-web3d-/, "");

/** Every Apps API method public/embed/geogebra-graph.js in OLMS calls. */
const OLMS_API = [
	"setCoordSystem",
	"getAllObjectNames",
	"evalLaTeX",
	"getLaTeXString",
	"getObjectType",
	"getVisible",
	"setFixed",
	"setAuxiliary",
	"setColor",
	"renameObject",
	"setLabelVisible",
	"setSize",
	"setPerspective",
	"exists",
	"deleteObject",
	"registerAddListener",
	"registerRemoveListener",
	"registerUpdateListener",
	"registerRenameListener",
	"registerClearListener",
	"registerClientListener",
];

/** GeoGebra LaTeX without sizing delimiters, typographic spacing or whitespace. */
const bare = (latex) => latex.replace(/\\(?:left|right|[;,!:])|\s+/g, "");

let server;
let origin;

test.beforeAll(async () => {
	if (!existsSync(join(bundleDir, "web3d", "web3d.nocache.js"))) {
		throw new Error(`No bundle at ${bundleDir}; run robotutor/package-web3d.sh or set ROBOTUTOR_BUNDLE.`);
	}
	server = await startServer({ bundleDir, commit });
	origin = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(() => new Promise((done) => server.close(done)));

/** Opens the host page and waits until the calculator inside the sandbox is ready. */
async function openCalculator(page) {
	const violations = [];
	page.on("console", (message) => {
		if (/Content Security Policy|Sandbox access violation|Refused to/i.test(message.text())) {
			violations.push(message.text());
		}
	});
	page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));
	await page.goto(`${origin}/host.html`);
	const frame = page.frame({ url: /\/frame\.html/ });
	await frame.waitForFunction(() => Boolean(window.__api), null, { timeout: 30_000 });
	return { frame, locator: page.frameLocator("#calculator"), violations };
}

test("boots in an opaque-origin sandbox under a nonce + 'strict-dynamic' policy", async ({ page }) => {
	const { frame, violations } = await openCalculator(page);
	expect(await frame.evaluate(() => window.origin)).toBe("null");
	expect(violations).toEqual([]);
});

test("exposes the Apps API surface OLMS uses", async ({ page }) => {
	const { frame } = await openCalculator(page);
	const missing = await frame.evaluate(
		(names) => names.filter((name) => typeof window.__api[name] !== "function"),
		OLMS_API,
	);
	expect(missing).toEqual([]);
});

test("evaluates LaTeX givens and reads learner objects back as LaTeX", async ({ page }) => {
	const { frame } = await openCalculator(page);
	const result = await frame.evaluate(() => {
		const api = window.__api;
		const events = [];
		api.registerAddListener((name) => events.push(`add:${name}`));
		api.registerRemoveListener((name) => events.push(`remove:${name}`));
		api.setCoordSystem(-5, 5, -4, 6);
		api.evalLaTeX("\\left(0,1\\right)");
		const [given] = api.getAllObjectNames();
		api.setFixed(given, true, false);
		api.setAuxiliary(given, true);
		api.setColor(given, 107, 114, 128);
		["y=2x+1", "x=3", "y>2x"].forEach((latex) => api.evalLaTeX(latex));
		const names = api.getAllObjectNames();
		const read = Object.fromEntries(
			names.map((name) => [
				name,
				{ type: api.getObjectType(name), latex: api.getLaTeXString(name), visible: api.getVisible(name) },
			]),
		);
		const learner = names.filter((name) => name !== given);
		learner.forEach((name) => api.deleteObject(name));
		return {
			given,
			fixed: api.isFixed(given),
			read: names.map((name) => read[name]),
			events,
			afterDelete: api.getAllObjectNames(),
			exists: learner.map((name) => api.exists(name)),
		};
	});
	expect(result.fixed).toBe(true);
	// OLMS reports objects of type "function" as "y=" + their LaTeX (geogebra-graph.js, expressionFor).
	expect(result.read.map((entry) => [entry.type, bare(entry.latex), entry.visible])).toEqual([
		["point", "(0,1)", true],
		["line", "y=2x+1", true],
		["line", "x=3", true],
		["inequality", "y>2x", true],
	]);
	expect(result.events.filter((event) => event.startsWith("add:"))).toHaveLength(4);
	expect(result.events.filter((event) => event.startsWith("remove:"))).toHaveLength(3);
	expect(result.afterDelete).toEqual([result.given]);
	expect(result.exists).toEqual([false, false, false]);
});

test("geometryCommands admits geometry, transformation and conic commands in the graphing app", async ({ page }) => {
	// Stock graphing filters these out silently; OLMS's prompt promises points, regions and transformations.
	const { frame } = await openCalculator(page);
	const created = await frame.evaluate(() => {
		const api = window.__api;
		const commands = [
			"A=(1,1)",
			"B=(4,1)",
			"C=(1,3)",
			"s=Segment(A,B)",
			"t=Polygon(A,B,C)",
			"r=Reflect(t,xAxis)",
			"u=Translate(t,Vector((2,2)))",
			"c=Circle((0,0),2)",
			"m=Slope(Line(A,C+(1,0)))",
			"M=Midpoint(A,B)",
		];
		return commands.map((command) => {
			const label = command.split("=")[0];
			api.evalCommand(command);
			return [label, api.exists(label) ? api.getObjectType(label) : null];
		});
	});
	expect(created).toEqual([
		["A", "point"],
		["B", "point"],
		["C", "point"],
		["s", "segment"],
		["t", "triangle"],
		["r", "triangle"],
		["u", "triangle"],
		["c", "circle"],
		["m", "numeric"],
		["M", "point"],
	]);
});

test("a renamed given keeps its value when the learner reuses its original label", async ({ page }) => {
	// setFixed only stops dragging: typing "A=(2,3)" or "f(x)=…" still redefines a fixed object
	// with that label. OLMS therefore renames each given to a reserved label (Given1, …) and hides it.
	const { frame, locator } = await openCalculator(page);
	const original = await frame.evaluate(() => {
		const api = window.__api;
		api.evalLaTeX("\\left(0,1\\right)");
		api.evalLaTeX("y=x^{2}-3");
		const names = api.getAllObjectNames();
		names.forEach((name, index) => {
			api.renameObject(name, `Given${index + 1}`);
			api.setFixed(`Given${index + 1}`, true, false);
			api.setAuxiliary(`Given${index + 1}`, true);
			api.setLabelVisible(`Given${index + 1}`, false);
		});
		return names;
	});
	expect(original).toHaveLength(2);
	await locator.getByText("Input…").click();
	for (const input of [`${original[0]}=(2,3)`, `${original[1]}(x)=2x+1`]) {
		await page.keyboard.type(input, { delay: 20 });
		await page.keyboard.press("Enter");
	}
	await expect
		.poll(() => frame.evaluate(() => window.__api.getAllObjectNames().length))
		.toBe(4);
	const after = await frame.evaluate((names) => {
		const api = window.__api;
		return {
			point: [api.getXcoord("Given1"), api.getYcoord("Given1"), api.isFixed("Given1")],
			curve: api.getValueString("Given2").replace(/\s+/g, ""),
			learner: names.map((name) => [api.getObjectType(name), api.getValueString(name).replace(/\s+/g, "")]),
		};
	}, original);
	expect(after.point).toEqual([0, 1, true]);
	expect(after.curve).toMatch(/x²-3$/);
	expect(after.learner[0]).toEqual(["point", `${original[0]}=(2,3)`]);
	expect(after.learner[1][1]).toMatch(/2x\+1$/);
});

test("keeps the on-screen keyboard closed on focus, offering it through its button", async ({ page }) => {
	const { locator } = await openCalculator(page);
	await locator.getByText("Input…").click();
	await expect(locator.getByRole("textbox", { name: /enter your equation or expression/i })).toBeFocused();
	await expect(locator.locator(".matOpenKeyboardBtn")).toBeVisible();
	await expect(locator.getByText("f(x)", { exact: true })).toHaveCount(0);
});

test("graph-only perspective hides the algebra input for read-only review", async ({ page }) => {
	const { frame, locator } = await openCalculator(page);
	const input = locator.getByRole("textbox", { name: /enter your equation or expression/i });
	await locator.getByText("Input…").click();
	await expect(input).toBeVisible();
	await frame.evaluate(() => window.__api.setPerspective("G"));
	await expect(input).toBeHidden();
	await frame.evaluate(() => window.__api.setPerspective("AG"));
	await expect(locator.locator(".algebraView")).toBeVisible();
});

test("tabExit reports leaving at both ends instead of trapping keyboard focus", async ({ page }) => {
	const { frame, locator } = await openCalculator(page);
	const pressUntilExit = async (key, argument) => {
		for (let press = 0; press < 12; press++) {
			await page.keyboard.press(key);
			const events = await frame.evaluate(() => window.__events);
			if (events.some((event) => event.type === "tabExit" && event.argument === argument)) return;
		}
		throw new Error(`${key} never reported tabExit ${argument}`);
	};
	await locator.getByText("Input…").click();
	await pressUntilExit("Tab", "forward");
	await locator.getByText("Input…").click();
	await pressUntilExit("Shift+Tab", "backward");
});

test("animates at display rate (fork patch: 60 fps cap, frame-synced timer)", async ({ page }) => {
	const { frame } = await openCalculator(page);
	const updatesPerSecond = await frame.evaluate(
		() =>
			new Promise((done) => {
				const api = window.__api;
				api.evalCommand("a=Slider(0,1000,0.001)");
				api.evalCommand("g(x)=sin(x+a)");
				api.setAnimationSpeed("a", 0.25);
				api.setAnimating("a", true);
				api.startAnimation();
				let last = api.getValue("a");
				let changes = 0;
				let started = 0;
				const tick = (time) => {
					if (!started) started = time;
					const value = api.getValue("a");
					if (value !== last) changes += 1;
					last = value;
					if (time - started < 2000) window.requestAnimationFrame(tick);
					else done((changes * 1000) / (time - started));
				};
				// Let the animation settle before measuring.
				window.setTimeout(() => window.requestAnimationFrame(tick), 500);
			}),
	);
	// Stock GeoGebra caps animation at 30 updates per second; the fork follows the display.
	expect(updatesPerSecond).toBeGreaterThan(45);
});
