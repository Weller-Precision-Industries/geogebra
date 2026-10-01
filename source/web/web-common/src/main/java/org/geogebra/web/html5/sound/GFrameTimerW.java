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

package org.geogebra.web.html5.sound;

import org.geogebra.common.util.GTimer;
import org.geogebra.common.util.GTimerListener;

import elemental2.dom.DomGlobal;
import elemental2.dom.FrameRequestCallback;

/**
 * Robotutor fork: a {@link GTimer} that fires on display frames
 * ({@code requestAnimationFrame}), at most once per frame and no sooner than
 * {@code delay} ms after the previous run (with half a frame of slack, so a
 * 16 ms delay runs on every frame of a 60 Hz display). Unlike an interval
 * timer it cannot drift against vsync, so animations step once per painted
 * frame.
 */
public class GFrameTimerW implements GTimer {
	/** half a 60 Hz frame: the earliest a run may come before its delay */
	private static final double SLACK_MS = 8;

	private final GTimerListener listener;
	private final FrameRequestCallback callback = this::onFrame;
	private int delay;
	private boolean running;
	private boolean repeat;
	private double last;
	private int frameRequest;

	/**
	 * @param listener
	 *            listener
	 * @param delay
	 *            minimum interval in ms
	 */
	public GFrameTimerW(GTimerListener listener, int delay) {
		this.listener = listener;
		this.delay = delay;
	}

	private void onFrame(double timestamp) {
		if (!running) {
			return;
		}
		if (timestamp - last + SLACK_MS < delay) {
			frameRequest = DomGlobal.requestAnimationFrame(callback);
			return;
		}
		last = timestamp;
		if (!repeat) {
			running = false;
		}
		listener.onRun();
		if (running) {
			frameRequest = DomGlobal.requestAnimationFrame(callback);
		}
	}

	private void schedule(boolean repeating) {
		if (running) {
			DomGlobal.cancelAnimationFrame(frameRequest);
		}
		repeat = repeating;
		running = true;
		last = DomGlobal.performance.now();
		frameRequest = DomGlobal.requestAnimationFrame(callback);
	}

	@Override
	public void start() {
		schedule(false);
	}

	@Override
	public void startRepeat() {
		if (!running) {
			schedule(true);
		}
	}

	@Override
	public void stop() {
		running = false;
		DomGlobal.cancelAnimationFrame(frameRequest);
	}

	@Override
	public boolean isRunning() {
		return running;
	}

	@Override
	public void setDelay(int delay) {
		// takes effect from the next frame; never restarts the schedule
		this.delay = delay;
	}
}
