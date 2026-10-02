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

package org.geogebra.web.full.main.activity;

import java.util.ArrayList;
import java.util.List;

import org.geogebra.common.kernel.commands.Commands;
import org.geogebra.common.main.settings.config.AppConfigGraphing;
import org.geogebra.web.full.gui.images.SvgPerspectiveResources;
import org.geogebra.web.html5.util.AppletParameters;
import org.geogebra.web.resources.SVGResource;

import elemental2.dom.DomGlobal;

/**
 * Specific behavior for graphing app
 */
public final class GraphingActivity extends BaseActivity {

	/**
	 * Graphing activity
	 */
	public GraphingActivity() {
		super(new AppConfigGraphing());
	}

	/**
	 * Graphing activity configured by the Robotutor applet parameters
	 * (geometryCommands, dataViews, previewPoints, disabledCommands).
	 * @param parameters applet parameters
	 */
	public GraphingActivity(AppletParameters parameters) {
		super(robotutorConfig(parameters));
	}

	private static AppConfigGraphing robotutorConfig(AppletParameters parameters) {
		AppConfigGraphing config = new AppConfigGraphing();
		if (parameters.getDataParamGeometryCommands()) {
			config.withGeometryCommands();
		}
		if (!parameters.getDataParamDataViews()) {
			config.withoutDataViews();
		}
		if (!parameters.getDataParamPreviewPoints()) {
			config.withoutPreviewPoints();
		}
		List<Commands> disabled = new ArrayList<>();
		for (String name : parameters.getDataParamDisabledCommands().split(",")) {
			Commands command = commandNamed(name.trim());
			if (command != null) {
				disabled.add(command);
			} else if (!name.trim().isEmpty()) {
				// Log is silent in production builds; an embedding page must see this.
				DomGlobal.console.warn("Robotutor: unknown disabled command " + name.trim());
			}
		}
		config.withDisabledCommands(disabled.toArray(new Commands[0]));
		return config;
	}

	private static Commands commandNamed(String name) {
		for (Commands command : Commands.values()) {
			if (command.name().equals(name)) {
				return command;
			}
		}
		return null;
	}

	@Override
	public SVGResource getIcon() {
		return SvgPerspectiveResources.INSTANCE.menu_icon_algebra_transparent();
	}
}
