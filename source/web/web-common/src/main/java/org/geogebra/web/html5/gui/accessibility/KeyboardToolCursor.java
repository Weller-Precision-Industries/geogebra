/*
 * GeoGebra - Dynamic Mathematics for Everyone
 * Copyright (c) GeoGebra GmbH, Altenbergerstr. 69, 4040 Linz, Austria
 * https://www.geogebra.org
 *
 * This file is licensed by GeoGebra GmbH under the EUPL 1.2 licence and
 * may be used under the EUPL 1.2 in compatible projects (see LICENSE.txt
 * and https://www.gnu.org/licenses/license-list.html#EUPL).
 *
 * Alternatively, you may use this file under the GeoGebra Non-Commercial
 * License Agreement (see https://www.geogebra.org/license). You may obtain
 * written permission to use this file for commercial use, including
 * relicensing to apply different license terms, from GeoGebra GmbH.
 *
 * See https://www.geogebra.org/license for details.
 */

package org.geogebra.web.html5.gui.accessibility;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.geogebra.common.awt.GPoint;
import org.geogebra.common.euclidian.EuclidianConstants;
import org.geogebra.common.euclidian.EuclidianView;
import org.geogebra.common.euclidian.event.PointerEventType;
import org.geogebra.common.gui.AccessibilityGroup;
import org.geogebra.common.gui.FocusableComponent;
import org.geogebra.common.kernel.Kernel;
import org.geogebra.common.kernel.geos.GeoElement;
import org.geogebra.common.kernel.geos.ScreenReaderBuilder;
import org.geogebra.common.main.Localization;
import org.geogebra.web.html5.euclidian.EuclidianControllerW;
import org.geogebra.web.html5.euclidian.EuclidianViewW;
import org.geogebra.web.html5.event.PointerEvent;
import org.geogebra.web.html5.main.AppW;
import org.gwtproject.user.client.ui.SimplePanel;
import org.jspecify.annotations.Nullable;

import elemental2.dom.DomGlobal;
import elemental2.dom.Event;
import elemental2.dom.HTMLElement;
import elemental2.dom.KeyboardEvent;
import jsinterop.base.Js;

/**
 * Robotutor (data-param-keyboardTools): a keyboard cursor in the graphics view while a
 * construction tool is active, so tools that need clicks work without a pointer.
 * <ul>
 * <li>Tab reaches the graphics view after the tool buttons; the cursor appears there.</li>
 * <li>Arrow keys move it one grid step (Shift: a tenth of a step).</li>
 * <li>Enter or Space clicks at the cursor through the ordinary pointer path, so snapping to
 * the grid and to existing objects is exactly what a click would do.</li>
 * <li>Positions, objects under the cursor and created objects are read to screen readers.</li>
 * </ul>
 */
public class KeyboardToolCursor implements FocusableComponent {

	private static final int MARKER_SIZE = 22;
	private static final int FINE_STEPS = 10;
	/** A focus this soon after a pointer press came from the pointer, not the keyboard. */
	private static final double POINTER_FOCUS_MS = 500;

	private final AppW app;
	private final SimplePanel marker = new SimplePanel();
	private double x;
	private double y;
	private boolean placed;
	private boolean active;
	private double lastPointerDown = -POINTER_FOCUS_MS;

	/**
	 * @param app application with data-param-keyboardTools
	 */
	public KeyboardToolCursor(AppW app) {
		this.app = app;
		HTMLElement markerElement = Js.uncheckedCast(marker.getElement());
		markerElement.className = "robotutorToolCursor";
		markerElement.setAttribute("aria-hidden", "true");
		markerElement.style.cssText = "position:absolute;width:" + MARKER_SIZE + "px;height:"
				+ MARKER_SIZE + "px;pointer-events:none;box-sizing:border-box;"
				+ "border:2px solid #6557d2;border-radius:50%;"
				+ "box-shadow:0 0 0 2px #fff;display:none;z-index:1";
		HTMLElement canvas = canvas();
		canvas.addEventListener("keydown", this::onKeyDown, true);
		// Reading text focuses GeoGebra's live region and then the canvas again: only a focus
		// that stays elsewhere ends the cursor.
		canvas.addEventListener("blur", event -> DomGlobal.setTimeout(ignore -> {
			if (DomGlobal.document.activeElement != canvas()) {
				deactivate();
			}
		}, 0));
		canvas.addEventListener("pointerdown", event -> {
			lastPointerDown = DomGlobal.performance.now();
			deactivate();
		});
		// Choosing a tool (or any keyboard route) can focus the graph directly: the cursor is there.
		canvas.addEventListener("focus", event -> {
			if (!active && isConstructionMode(app.getMode())
					&& DomGlobal.performance.now() - lastPointerDown > POINTER_FOCUS_MS) {
				activate();
			}
		});
	}

	private EuclidianViewW view() {
		return (EuclidianViewW) app.getActiveEuclidianView();
	}

	private HTMLElement canvas() {
		return Js.uncheckedCast(view().getCanvasElement());
	}

	/**
	 * @param mode application mode
	 * @return whether the mode takes clicks in the graphics view to build objects
	 */
	static boolean isConstructionMode(int mode) {
		return mode != EuclidianConstants.MODE_MOVE
				&& mode != EuclidianConstants.MODE_SELECTION_LISTENER
				&& mode != EuclidianConstants.MODE_MOVE_ROTATE
				&& mode != EuclidianConstants.MODE_TRANSLATE_VIEW;
	}

	@Override
	public boolean focusIfVisible(boolean reverse) {
		if (!isConstructionMode(app.getMode()) || canvas().offsetParent == null) {
			return false;
		}
		activate();
		canvas().focus();
		return true;
	}

	private void activate() {
		if (!placed || !isInView()) {
			placeAtStart();
		}
		active = true;
		showMarker();
		int mode = app.getMode();
		announce(app.getToolName(mode) + ". " + app.getToolHelp(mode) + ". " + position() + ". "
				+ app.getLocalization().getMenuDefault("robotutor.ToolCursorHelp",
				"On the graph, arrow keys move the cursor and Enter clicks."));
	}

	@Override
	public boolean hasFocus() {
		return active && DomGlobal.document.activeElement == canvas();
	}

	@Override
	public boolean focusNext() {
		deactivate();
		return false;
	}

	@Override
	public boolean focusPrevious() {
		deactivate();
		return false;
	}

	@Override
	public AccessibilityGroup getAccessibilityGroup() {
		return AccessibilityGroup.TOOL_CURSOR;
	}

	@Override
	public AccessibilityGroup.@Nullable ViewControlId getViewControlId() {
		return null;
	}

	private void deactivate() {
		active = false;
		HTMLElement element = Js.uncheckedCast(marker.getElement());
		element.style.display = "none";
	}

	private void onKeyDown(Event event) {
		if (!active || !isConstructionMode(app.getMode())) {
			return;
		}
		KeyboardEvent key = Js.uncheckedCast(event);
		double[] grid = gridStep();
		double fraction = key.shiftKey ? 1.0 / FINE_STEPS : 1;
		switch (key.key) {
		case "ArrowLeft":
			move(-grid[0] * fraction, 0, key.shiftKey);
			break;
		case "ArrowRight":
			move(grid[0] * fraction, 0, key.shiftKey);
			break;
		case "ArrowUp":
			move(0, grid[1] * fraction, key.shiftKey);
			break;
		case "ArrowDown":
			move(0, -grid[1] * fraction, key.shiftKey);
			break;
		case "Enter":
		case " ":
			click();
			break;
		default:
			return; // Tab, Escape and typing keep their usual meaning
		}
		event.preventDefault();
		event.stopImmediatePropagation();
	}

	private double[] gridStep() {
		double[] distances = view().getGridDistances();
		double stepX = distances != null && distances.length > 0 && distances[0] > 0
				? distances[0] : 1;
		double stepY = distances != null && distances.length > 1 && distances[1] > 0
				? distances[1] : stepX;
		return new double[] {stepX, stepY};
	}

	private void placeAtStart() {
		EuclidianView view = view();
		double[] grid = gridStep();
		boolean originShown = view.getXmin() < 0 && view.getXmax() > 0
				&& view.getYmin() < 0 && view.getYmax() > 0;
		x = originShown ? 0 : snap((view.getXmin() + view.getXmax()) / 2, grid[0]);
		y = originShown ? 0 : snap((view.getYmin() + view.getYmax()) / 2, grid[1]);
		placed = true;
	}

	private static double snap(double value, double step) {
		return Math.round(value / step) * step;
	}

	private boolean isInView() {
		EuclidianView view = view();
		return x >= view.getXmin() && x <= view.getXmax()
				&& y >= view.getYmin() && y <= view.getYmax();
	}

	private void move(double dx, double dy, boolean fine) {
		double[] grid = gridStep();
		double nextX = x + dx;
		double nextY = y + dy;
		if (!fine) {
			nextX = snap(nextX, grid[0]);
			nextY = snap(nextY, grid[1]);
		}
		EuclidianView view = view();
		if (nextX < view.getXmin() || nextX > view.getXmax()
				|| nextY < view.getYmin() || nextY > view.getYmax()) {
			announce(app.getLocalization().getMenuDefault("robotutor.ToolCursorEdge",
					"Edge of the graph.") + " " + position());
			return;
		}
		x = nextX;
		y = nextY;
		showMarker();
		hover();
		String under = describeHits();
		announce(position() + (under.isEmpty() ? "" : ", " + under));
	}

	private double screenX() {
		return view().toScreenCoordXd(x);
	}

	private double screenY() {
		return view().toScreenCoordYd(y);
	}

	private PointerEvent pointerEvent() {
		EuclidianControllerW controller = (EuclidianControllerW) view().getEuclidianController();
		return new PointerEvent(screenX(), screenY(), PointerEventType.MOUSE,
				controller.getOffsets());
	}

	private void hover() {
		view().getEuclidianController().wrapMouseMoved(pointerEvent());
	}

	private void click() {
		Set<GeoElement> before = new HashSet<>(
				app.getKernel().getConstruction().getGeoSetLabelOrder());
		List<GeoElement> selectedBefore = new ArrayList<>(app.getSelectionManager().getSelectedGeos());
		PointerEvent event = pointerEvent();
		view().getEuclidianController().wrapMouseMoved(event);
		view().getEuclidianController().wrapMousePressed(event);
		view().getEuclidianController().wrapMouseReleased(event);
		// a click can move focus (e.g. to the algebra input); the keyboard user stays here
		canvas().focus();
		active = true;
		showMarker();
		List<String> created = new ArrayList<>();
		for (GeoElement geo : app.getKernel().getConstruction().getGeoSetLabelOrder()) {
			if (!before.contains(geo) && geo.isEuclidianVisible() && geo.isLabelSet()) {
				created.add(aural(geo));
			}
		}
		if (!created.isEmpty()) {
			announce(String.join(" ", created));
			return;
		}
		List<String> selected = new ArrayList<>();
		for (GeoElement geo : app.getSelectionManager().getSelectedGeos()) {
			if (!selectedBefore.contains(geo)) {
				selected.add(aural(geo));
			}
		}
		Localization loc = app.getLocalization();
		announce(selected.isEmpty()
				? loc.getMenuDefault("robotutor.ToolCursorNothing", "Nothing happened at")
						+ " " + position()
				: loc.getMenuDefault("robotutor.ToolCursorSelected", "Selected") + " "
						+ String.join(" ", selected));
	}

	private String aural(GeoElement geo) {
		ScreenReaderBuilder builder = new ScreenReaderBuilder(app.getLocalization());
		geo.addAuralName(builder);
		return builder.toString().trim();
	}

	private String describeHits() {
		EuclidianView view = view();
		view.setHits(new GPoint((int) Math.round(screenX()), (int) Math.round(screenY())),
				PointerEventType.MOUSE);
		List<String> names = new ArrayList<>();
		for (GeoElement geo : view.getHits()) {
			if (geo.isLabelSet() && geo.isEuclidianVisible() && names.size() < 3) {
				names.add(geo.translatedTypeString() + " " + geo.getLabelSimple());
			}
		}
		if (names.isEmpty()) {
			return "";
		}
		return app.getLocalization().getMenuDefault("robotutor.ToolCursorOn", "on") + " "
				+ String.join(", ", names);
	}

	private String position() {
		Kernel kernel = app.getKernel();
		return "(" + kernel.format(x, app.getScreenReaderTemplate()) + ", "
				+ kernel.format(y, app.getScreenReaderTemplate()) + ")";
	}

	private void showMarker() {
		if (!marker.isAttached()) {
			view().add(marker);
		}
		HTMLElement element = Js.uncheckedCast(marker.getElement());
		element.style.left = (screenX() - MARKER_SIZE / 2.0) + "px";
		element.style.top = (screenY() - MARKER_SIZE / 2.0) + "px";
		element.style.display = "block";
	}

	private void announce(String text) {
		view().getScreenReader().readText(text);
	}
}
