// Robotutor contract (Linear OLM-2025): every GeoGebra behaviour OLMS relies on, checked
// against a built bundle served the way OLMS serves it (see server.mjs). Run after each
// upstream merge, before publishing a release. The bundle is ROBOTUTOR_BUNDLE (an unpacked
// geogebra-web3d-<commit> directory) or the one robotutor/package-web3d.sh staged for HEAD.
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import AxeBuilder from "@axe-core/playwright";
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
async function openCalculator(page, params = {}) {
	const violations = [];
	page.on("console", (message) => {
		if (/Content Security Policy|Sandbox access violation|Refused to/i.test(message.text())) {
			violations.push(message.text());
		}
	});
	page.on("pageerror", (error) => violations.push(`pageerror: ${error.message}`));
	page.on("console", (message) => {
		if (/unknown disabled command/i.test(message.text())) violations.push(message.text());
	});
	await page.goto(`${origin}/host.html?${new URLSearchParams(params)}`);
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

test("a curated toolbar offers only the listed click tools, and the Point tool plots by clicking", async ({
	page,
}) => {
	const { frame, locator, violations } = await openCalculator(page, {
		showToolBar: "true",
		customToolBar: "0 1 15 | 6",
		dataViews: "false",
	});
	// No Table or Spreadsheet view in the side rail.
	const rail = locator.locator("button.tabButton");
	await expect(rail).toHaveText(["Algebra", "Tools"]);
	await rail.filter({ hasText: "Tools" }).click();
	const tool = (name) => locator.locator(`button[aria-label^="${name}. "]`).filter({ hasText: name });
	for (const name of ["Move", "Point", "Segment", "Delete"]) await expect(tool(name)).toBeVisible();
	for (const name of ["Line", "Polygon", "Reflect about Line", "Intersect"]) await expect(tool(name)).toHaveCount(0);
	await tool("Point").click();
	// The graph occupies the right of the frame, beside the side panel.
	const box = await page.locator("#calculator").boundingBox();
	await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.3);
	await expect.poll(() => frame.evaluate(() => window.__api.getAllObjectNames())).toHaveLength(1);
	expect(await frame.evaluate(() => window.__api.getObjectType(window.__api.getAllObjectNames()[0]))).toBe("point");
	expect(violations).toEqual([]);
});

test("disabledCommands and previewPoints=false stop the calculator doing the learner's work", async ({ page }) => {
	const created = async (frame) =>
		frame.evaluate(() => {
			const api = window.__api;
			api.evalCommand("f(x)=2x-2");
			api.evalCommand("g(x)=x+1");
			const out = {};
			for (const [label, command] of [
				["I", "Intersect(f,g)"],
				["R", "Root(f)"],
				["s", "Slope(Line((0,0),(1,2)))"],
				["M", "Reflect((1,2),xAxis)"],
				["S", "Segment((0,0),(1,1))"],
			]) {
				api.evalCommand(`${label}=${command}`);
				out[label] = api.exists(label);
			}
			return out;
		});
	const itemMenu = async (locator) => {
		await locator.locator("button.more").first().click();
		const items = await locator.getByRole("menuitem").allTextContents();
		await page.keyboard.press("Escape");
		return items.map((item) => item.trim());
	};

	const open = await openCalculator(page, { geometryCommands: "true" });
	expect(await created(open.frame)).toEqual({ I: true, R: true, s: true, M: true, S: true });
	expect(await itemMenu(open.locator)).toEqual(expect.arrayContaining(["Special Points"]));

	const guided = await openCalculator(page, {
		geometryCommands: "true",
		previewPoints: "false",
		disabledCommands: "Intersect,Root,Slope,Reflect",
	});
	expect(await created(guided.frame)).toEqual({ I: false, R: false, s: false, M: false, S: true });
	const items = await itemMenu(guided.locator);
	expect(items).not.toEqual(expect.arrayContaining(["Special Points"]));
	expect(items.filter((item) => /^(Solve|Statistics)$/.test(item))).toEqual([]);
	expect(guided.violations).toEqual([]);
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

test("with the toolbar shown, Tab and Shift+Tab still hand keyboard focus to the host page", async ({ page }) => {
	// The rail and undo buttons join GeoGebra's focus order; none of them may trap focus.
	const { locator } = await openCalculator(page, {
		showToolBar: "true",
		customToolBar: "0 1 15 | 6",
		dataViews: "false",
	});
	await locator.getByText("Input…").click();
	for (const input of ["y=2x+1", "A=(2,3)"]) {
		await page.keyboard.type(input, { delay: 20 });
		await page.keyboard.press("Enter");
	}
	const pressUntilHost = async (key, id) => {
		for (let press = 0; press < 12; press++) {
			await page.keyboard.press(key);
			// The hand-off is an asynchronous client event and message.
			await page.waitForTimeout(100);
			if ((await page.evaluate(() => document.activeElement?.id)) === id) return;
		}
		throw new Error(`${key} never reached #${id}`);
	};
	await pressUntilHost("Tab", "after");
	await locator.getByText("Input…").click();
	await pressUntilHost("Shift+Tab", "before");
});

test("an unknown disabledCommands name is reported on the console", async ({ page }) => {
	// GeoGebra's own Log is silent in production builds, so the fork warns on the console.
	const { violations } = await openCalculator(page, { disabledCommands: "Intersect,NotACommand" });
	expect(violations).toEqual([expect.stringMatching(/unknown disabled command NotACommand/)]);
});

test("portraitPanelShare gives the graph most of a phone-sized portrait frame", async ({ page }) => {
	// Upstream keeps at least five rows for the panel in portrait, sized for a full-screen app;
	// in a 560px embedded frame that leaves the graph only half the height.
	const graphHeight = async (params) => {
		const { frame } = await openCalculator(page, {
			frameWidth: "360",
			frameHeight: "560",
			showToolBar: "true",
			customToolBar: "0 1 15 | 6",
			dataViews: "false",
			...params,
		});
		await page.waitForTimeout(500);
		return frame.evaluate(() =>
			Math.max(...[...document.querySelectorAll("canvas")].map((canvas) => canvas.getBoundingClientRect().height)),
		);
	};
	const stock = await graphHeight({});
	const shared = await graphHeight({ portraitPanelShare: "0.35" });
	// Stock: five 56px rows minimum (280 of 560). With a 0.35 share: 65% of the height.
	expect(stock).toBeLessThanOrEqual(285);
	expect(shared).toBeGreaterThanOrEqual(0.64 * 560);
});

test("the scientific app runs in the sandbox, with its keypad opening on focus", async ({ page }) => {
	// OLMS offers it as a tool beside a question (ADR-116): same frame, same CSP, appName "scientific".
	const { frame, locator, violations } = await openCalculator(page, {
		appName: "scientific",
		showKeyboardOnFocus: "true",
		frameWidth: "720",
		frameHeight: "430",
	});
	await locator.locator(".algebraView").first().click();
	await expect(locator.locator(".TabbedKeyBoard")).toBeVisible();
	for (const key of ["sin", "cos", "ln"]) {
		await expect(locator.getByRole("button", { name: key, exact: true }).first()).toBeVisible();
	}
	await page.waitForTimeout(500);
	const before = await frame.evaluate(() => window.__api.getAllObjectNames().length);
	await page.keyboard.type("3.5*4.2^2", { delay: 20 });
	await page.keyboard.press("Enter");
	await expect.poll(() => frame.evaluate(() => window.__api.getAllObjectNames().length)).toBe(before + 1);
	expect(violations).toEqual([]);
});

test("loads a translated UI in the sandbox, with commands still accepted in English", async ({ page }) => {
	// OLMS starts GeoGebra in the learner's language; the language file is fetched on demand by an
	// injected script, which the nonce + 'strict-dynamic' policy must allow, and the opaque origin
	// has no localStorage for GeoGebra's language cache.
	const { frame, locator, violations } = await openCalculator(page, { language: "es" });
	await expect(locator.getByText("Entrada…")).toBeVisible();
	const result = await frame.evaluate(() => {
		const api = window.__api;
		api.evalCommand("f(x)=2x-4");
		api.evalCommand("A=Root(f)");
		return { names: api.getAllObjectNames(), command: api.getCommandString("A", false) };
	});
	expect(result.names).toEqual(expect.arrayContaining(["f", "A"]));
	// OLMS reports constructions with the unlocalized command string (internal bracket syntax),
	// so the grader reads one vocabulary whatever the UI language.
	expect(result.command).toBe("Root[f]");
	expect(violations).toEqual([]);
});

test("right-to-left languages load too", async ({ page }) => {
	const { locator, violations } = await openCalculator(page, { language: "ar" });
	await expect(locator.locator(".algebraView").first()).toBeVisible();
	await expect(locator.getByText("Input…")).toHaveCount(0);
	expect(violations).toEqual([]);
});

/** Serious or critical WCAG 2.x A/AA findings inside the applet. Colours are the embedder's to set. */
async function axeFindings(page) {
	const results = await new AxeBuilder({ page })
		.include("#calculator")
		.withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
		.disableRules(["color-contrast"])
		.analyze();
	return results.violations
		.filter((violation) => violation.impact === "serious" || violation.impact === "critical")
		.map((violation) => `${violation.id}: ${violation.nodes.map((node) => `${node.target.join(" ")} ${node.html.slice(0, 90)}`).join(" | ")}`);
}

test("the graphing app with learner objects has no serious accessibility findings", async ({ page }) => {
	// Fork patch: algebra rows drop GWT's orphaned treeitem role, and controls the applet hides from
	// assistive technology (tab rail, add-item button) are not focusable either.
	const { frame, locator } = await openCalculator(page);
	await frame.evaluate(() => {
		window.__api.evalCommand("f(x)=2x+1");
		window.__api.evalCommand("A=(1,3)");
	});
	await locator.locator(".avItem").first().click();
	expect(await axeFindings(page)).toEqual([]);
});

test("an empty, input-less algebra view with the Tools tab open has no serious accessibility findings", async ({
	page,
}) => {
	// What a click-only question shows (showAlgebraInput=false), with keyboardTools.
	const { locator } = await openCalculator(page, {
		showToolBar: "true",
		customToolBar: "0 1 15 | 6",
		dataViews: "false",
		showAlgebraInput: "false",
		keyboardTools: "true",
		frameWidth: "732",
		frameHeight: "610",
	});
	await locator.locator("button.tabButton").filter({ hasText: "Tools" }).click();
	expect(await axeFindings(page)).toEqual([]);
	// and after placing a point from the keyboard
	await locator.locator('button[aria-label^="Point. "]').focus();
	await page.keyboard.press("Tab");
	await page.keyboard.press("Shift+Tab");
	await page.keyboard.press("Enter");
	await expect(locator.locator(".robotutorToolCursor")).toBeVisible();
	await page.keyboard.press("ArrowRight");
	await page.keyboard.press("Enter");
	await page.waitForTimeout(500);
	expect(await axeFindings(page)).toEqual([]);
});

test("the scientific app has no serious accessibility findings", async ({ page }) => {
	const { frame } = await openCalculator(page, { appName: "scientific", frameWidth: "720", frameHeight: "430" });
	await frame.evaluate(() => window.__api.evalCommand("3.5*4.2^2"));
	expect(await axeFindings(page)).toEqual([]);
});

/** Records what GeoGebra's live region reads (it clears itself after a second). */
async function recordSpeech(frame) {
	await frame.evaluate(() => {
		window.__spoken = [];
		new MutationObserver(() => {
			for (const region of document.querySelectorAll("[id^=screenReader]")) {
				const text = region.textContent.trim();
				if (text && window.__spoken.at(-1) !== text) window.__spoken.push(text);
			}
		}).observe(document.body, { subtree: true, childList: true, characterData: true });
	});
}

/** Presses Tab (or Shift+Tab) until `matches(document.activeElement)` holds inside the applet. */
async function tabTo(page, frame, matches, { backward = false, limit = 40 } = {}) {
	for (let press = 0; press < limit; press++) {
		if (await frame.evaluate(matches)) return;
		await page.keyboard.press(backward ? "Shift+Tab" : "Tab");
		await page.waitForTimeout(80);
	}
	expect(await frame.evaluate(matches), `focus never reached ${matches}`).toBe(true);
}

const focusedTool = (name) =>
	new Function(
		`const a = document.activeElement; return !!a && (a.getAttribute("aria-label") || "").startsWith(${JSON.stringify(`${name}. `)});`,
	);
const focusedRail = (name) =>
	new Function(
		`const a = document.activeElement; return !!a && a.classList.contains("tabButton") && a.textContent.trim() === ${JSON.stringify(name)};`,
	);
const focusedCanvas = () => document.activeElement?.tagName === "CANVAS";

async function pressKeys(page, keys) {
	for (const key of keys) {
		await page.keyboard.press(key);
		await page.waitForTimeout(60);
	}
}

test("keyboardTools builds a point, a segment and a polygon without a pointer, read aloud", async ({ page }) => {
	// Fork patch (OLM-2244): with keyboardTools the rail and tool buttons join the keyboard order,
	// and with a construction tool active the graph offers a cursor that clicks through the
	// ordinary pointer path.
	const { frame, locator, violations } = await openCalculator(page, {
		showToolBar: "true",
		customToolBar: "0 1 15 16 30 | 6",
		dataViews: "false",
		keyboardTools: "true",
	});
	await frame.evaluate(() => window.__api.setCoordSystem(-6, 6, -6, 6));
	await recordSpeech(frame);
	await page.locator("#before").focus();
	await page.keyboard.press("Tab");

	await tabTo(page, frame, focusedRail("Tools"));
	await page.keyboard.press("Enter");
	await tabTo(page, frame, focusedTool("Point"));
	await page.keyboard.press("Enter");
	await expect(locator.locator('button[aria-label^="Point. "]')).toHaveAttribute("aria-pressed", "true");
	await tabTo(page, frame, focusedCanvas);
	await expect(locator.locator(".robotutorToolCursor")).toBeVisible();
	await pressKeys(page, ["ArrowRight", "ArrowRight", "ArrowUp", "ArrowUp", "ArrowUp", "Enter"]);
	await expect.poll(() => frame.evaluate(() => window.__api.getAllObjectNames())).toEqual(["A"]);
	// The cursor moves in grid steps from the origin, so A is the grid point two right, three up.
	const [ax, ay] = await frame.evaluate(() => [window.__api.getXcoord("A"), window.__api.getYcoord("A")]);
	const stepX = ax / 2;
	const stepY = ay / 3;
	expect(stepX).toBeGreaterThan(0);
	expect(stepY).toBeGreaterThan(0);

	// Segment: Shift+Tab back to the tools, pick Segment, click A (selected by snapping) and a new point.
	await tabTo(page, frame, focusedTool("Segment"), { backward: true });
	await page.keyboard.press("Enter");
	await tabTo(page, frame, focusedCanvas);
	await pressKeys(page, ["Enter", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Enter"]);
	await expect.poll(() => frame.evaluate(() => window.__api.getAllObjectNames().length)).toBe(3);
	const segment = await frame.evaluate(() =>
		window.__api.getAllObjectNames().find((name) => window.__api.getObjectType(name) === "segment"),
	);
	expect(segment).toBeTruthy();
	expect(await frame.evaluate((name) => window.__api.getCommandString(name, false), segment)).toBe("Segment[A, B]");
	expect(await frame.evaluate(() => [window.__api.getXcoord("B"), window.__api.getYcoord("B")])).toEqual([
		-2 * stepX,
		3 * stepY,
	]);

	// Polygon B, C, D, back to B.
	await tabTo(page, frame, focusedTool("Polygon"), { backward: true });
	await page.keyboard.press("Enter");
	await tabTo(page, frame, focusedCanvas);
	await pressKeys(page, ["Enter", "ArrowDown", "ArrowDown", "ArrowDown", "Enter"]);
	await pressKeys(page, ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]);
	await pressKeys(page, ["ArrowUp", "ArrowUp", "ArrowUp", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowLeft", "Enter"]);
	const polygon = await expect
		.poll(() =>
			frame.evaluate(() =>
				window.__api.getAllObjectNames().find((name) => window.__api.getObjectType(name) === "triangle"),
			),
		)
		.toBeTruthy();
	void polygon;

	// Reflect the triangle in the x-axis: click inside it (the cursor is back on B), then on the axis
	await tabTo(page, frame, focusedTool("Reflect about Line"), { backward: true });
	await page.keyboard.press("Enter");
	await tabTo(page, frame, focusedCanvas);
	// (past the triangle's side CD, which also lies on the axis)
	await pressKeys(page, ["ArrowDown", "ArrowRight", "Enter", "ArrowDown", "ArrowDown"]);
	await pressKeys(page, ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight", "Enter"]);
	await expect
		.poll(() =>
			frame.evaluate(() =>
				window.__api.getAllObjectNames().filter((name) => window.__api.getObjectType(name) === "triangle"),
			),
		)
		.toHaveLength(2);
	// GeoGebra records the image as Polygon[B', C', D'] with B' = Mirror[B, xAxis].
	expect(await frame.evaluate(() => window.__api.getCommandString("B'", false))).toBe("Mirror[B, xAxis]");

	// Tab walks on from the graph (through the objects) and leaves the applet: no keyboard trap.
	await frame.evaluate(() => {
		window.__events.length = 0;
	});
	for (let press = 0; press < 25; press++) {
		if (await frame.evaluate(() => window.__events.some((event) => event.type === "tabExit"))) break;
		await page.keyboard.press("Tab");
		await page.waitForTimeout(60);
	}
	expect(await frame.evaluate(() => window.__events.filter((event) => event.type === "tabExit"))).toEqual([
		{ type: "tabExit", argument: "forward" },
	]);

	const spoken = await frame.evaluate(() => window.__spoken.join(" | "));
	expect(spoken).toMatch(/Point\. Select position.*\(0, 0\)\. On the graph, arrow keys move the cursor and Enter clicks/);
	expect(spoken).toMatch(/Point A/);
	expect(spoken).toMatch(/Selected Point A/);
	expect(spoken).toMatch(/Point B =\(−2, 6\) Segment f/);
	expect(spoken).toMatch(/Triangle t1/);
	expect(spoken).toMatch(/on Segment f, Point A/);
	expect(violations).toEqual([]);
	// The open Tools tab, its buttons and the cursor pass axe too.
	expect(await axeFindings(page)).toEqual([]);
});

test("without keyboardTools the tools stay pointer-only and hidden from assistive technology", async ({ page }) => {
	const { frame, locator } = await openCalculator(page, {
		showToolBar: "true",
		customToolBar: "0 1 15 | 6",
		dataViews: "false",
	});
	await expect(locator.locator("button.tabButton").first()).toHaveAttribute("aria-hidden", "true");
	await locator.locator("button.tabButton").filter({ hasText: "Tools" }).click();
	await frame.evaluate(() => window.__api.setMode(1));
	await page.locator("#before").focus();
	for (let press = 0; press < 12; press++) {
		await page.keyboard.press("Tab");
		const focused = await frame.evaluate(() => document.activeElement?.className ?? "");
		expect(focused).not.toMatch(/tabButton|toolButton|moveFloatingBtn/);
	}
	await expect(locator.locator(".robotutorToolCursor")).toHaveCount(0);
});

test("decimalResults shows typed results as decimals first, exact form one toggle away", async ({ page }) => {
	// Fork patch: like a handheld scientific calculator (OLMS offers the scientific app as a tool).
	const typedResult = async (decimalResults) => {
		const { frame, locator } = await openCalculator(page, {
			appName: "scientific",
			showKeyboardOnFocus: "true",
			decimalResults,
			frameWidth: "720",
			frameHeight: "430",
		});
		await locator.locator(".algebraView").first().click();
		await expect(locator.locator(".TabbedKeyBoard")).toBeVisible();
		await page.waitForTimeout(500);
		await page.keyboard.type("0.5*3.5*4.2^2", { delay: 20 });
		await page.keyboard.press("Enter");
		await expect(locator.locator(".avItem button[aria-label^='Show ']")).toHaveCount(1);
		return frame.evaluate(() => {
			const names = window.__api.getAllObjectNames();
			const toggle = document.querySelector(".avItem button[aria-label^='Show ']");
			return { value: window.__api.getValueString(names[names.length - 1]), toggle: toggle?.getAttribute("aria-label") };
		});
	};
	expect(await typedResult("false")).toEqual({ value: "3087 / 100", toggle: "Show approximate result" });
	expect(await typedResult("true")).toEqual({ value: "30.87", toggle: "Show result as fraction" });
test("the probability calculator runs in the sandbox, computes, and has no serious accessibility findings", async ({
	page,
}) => {
	// OLMS offers it as a tool beside statistics questions (ADR-116): Suite's probability sub-app.
	const { frame, locator, violations } = await openCalculator(page, {
		appName: "suite",
		subApp: "probability",
		showAppsPicker: "false",
		portraitPanelShare: "0.6",
		frameWidth: "390",
		frameHeight: "700",
	});
	await expect(locator.getByText("Distribution").first()).toBeVisible();
	// Standard normal, P(-1 <= X <= 1) = 0.6827 by default; P(-2 <= X <= 2) = 0.9545 after editing the bounds.
	await expect(locator.getByText("0.6827")).toBeVisible();
	// Parameters are typed (GeoGebra keeps the interval at μ ± σ, so the probability holds).
	const sigma = locator.getByRole("textbox", { name: "Parameter σ" });
	await locator.locator(".inputTextField", { hasText: "Parameter σ" }).locator("canvas").click();
	await page.waitForTimeout(300);
	await sigma.press("End");
	await sigma.press("Backspace");
	await sigma.pressSequentially("2", { delay: 50 });
	await sigma.press("Enter");
	await expect(locator.getByText("0.6827")).toBeVisible();
	// The interval type is a keyboard-operable radio group.
	await locator.getByRole("radio", { name: "Left Sided" }).focus();
	await page.keyboard.press("Enter");
	await expect(locator.getByRole("radio", { name: "Left Sided" })).toHaveAttribute("aria-checked", "true");
	await expect(locator.getByRole("radio", { name: "Interval" })).toHaveAttribute("aria-checked", "false");
	await expect.poll(() => frame.evaluate(() => document.body.innerText)).toMatch(/P\(X ≤/);
	expect(violations).toEqual([]);
	expect(await axeFindings(page)).toEqual([]);
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
