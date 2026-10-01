/*
 * GeoGebra - Dynamic Mathematics for Everyone
 * Copyright (c) GeoGebra GmbH, Altenbergerstr. 69, 4040 Linz, Austria
 * https://www.geogebra.org
 *
 * This file is licensed by GeoGebra GmbH under the EUPL 1.2 licence and
 * may be used under the EUPL 1.2 in compatible projects (see Article 5
 * and the Appendix of EUPL 1.2 for details).
 * You may obtain a copy of the licence at:
 * https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * Note: The overall GeoGebra software package is free to use for
 * non-commercial purposes only.
 * See https://www.geogebra.org/license for full licensing details
 */

package org.geogebra.web.html5.main;

import elemental2.dom.DomGlobal;
import elemental2.dom.FrameRequestCallback;

/**
 * Timer system for view repaints.
 *
 * <p>Robotutor fork: ticks on {@code requestAnimationFrame} instead of a 16 ms
 * {@code setInterval}, so views repaint once per display frame, in phase with
 * vsync, at the display's own refresh rate (60, 120, 144 Hz ...). Views asked
 * to repaint during a tick paint synchronously in that frame (see
 * {@link #isInFrame()}), instead of queueing another frame.</p>
 */
public class TimerSystemW {

	/**
	 * loops to wait before performing a repaint
	 */
	public static final int EUCLIDIAN_LOOPS = 0; // no wait, repaint every loop

	public static final int ALGEBRA_LOOPS = 5;

	public static final int SPREADSHEET_LOOPS = ALGEBRA_LOOPS;

	public static final int REPAINT_FLAG = 0;

	public static final int SLEEPING_FLAG = -1;

	/** idle frames before the loop stops until the next repaint request */
	private static final int IDLE_FRAMES = 30;

	private static boolean inFrame = false;

	private final AppW app;

	private final FrameRequestCallback frameCallback = timestamp -> onFrame();

	private int idle;
	private boolean running = false;
	private boolean detached = false;

	/**
	 * Create new timer system
	 *
	 * @param app
	 *            application
	 */
	public TimerSystemW(AppW app) {
		this.app = app;
		this.idle = 0;
		requestFrame();
	}

	/**
	 * @return whether the caller runs inside a repaint tick, where painting
	 *         immediately lands in the current display frame
	 */
	public static boolean isInFrame() {
		return inFrame;
	}

	private void requestFrame() {
		running = true;
		DomGlobal.requestAnimationFrame(frameCallback);
	}

	private void onFrame() {
		if (!running || detached) {
			return;
		}
		inFrame = true;
		try {
			tick();
		} finally {
			inFrame = false;
		}
		if (running) {
			DomGlobal.requestAnimationFrame(frameCallback);
		}
	}

	/**
	 * Execute one timer tick.
	 */
	protected void tick() {
		if (suggestRepaint()) {
			idle = 0;
		} else {
			idle++;
		}
		if (idle > IDLE_FRAMES) {
			idle = 0;
			running = false;
		}
	}

	/**
	 * suggests views to repaint
	 *
	 * @return whether at least one view needed repaint
	 */
	boolean suggestRepaint() {
		if (app == null || app.getKernel() == null) {
			return false;
		}
		return app.getKernel().notifySuggestRepaint();
	}

	/**
	 * Make sure the clock is ticking
	 */
	public void ensureRunning() {
		if (detached || running) {
			return;
		}
		idle = 0;
		requestFrame();
	}

	/**
	 * Stop the loop, make sure it's not revived from `ensureTimerRunning`
	 * which may be called asynchronously
	 */
	public void detach() {
		running = false;
		detached = true;
	}
}
