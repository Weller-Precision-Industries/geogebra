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

package org.geogebra.common.main.settings.config;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.geogebra.common.kernel.commands.Commands;
import org.geogebra.common.kernel.commands.selector.CommandFilter;
import org.junit.jupiter.api.Test;

/** Robotutor fork: the graphing app with the Geometry app's (non-CAS) command set. */
class AppConfigGraphingGeometryCommandsTest {

	private static final Commands[] GEOMETRY = {
			Commands.Segment, Commands.Polygon, Commands.Circle, Commands.Reflect,
			Commands.Translate, Commands.Rotate, Commands.Dilate, Commands.Slope,
			Commands.Midpoint, Commands.Distance, Commands.Tangent, Commands.Vertex
	};

	@Test
	void graphingRestrictsGeometryByDefault() {
		AppConfigGraphing config = new AppConfigGraphing();
		CommandFilter filter = config.createCommandFilter();
		for (Commands command : GEOMETRY) {
			assertFalse(filter.isCommandAllowed(command), command.name());
		}
		assertNotNull(config.getCommandArgumentFilter());
		assertNotNull(config.newCommandSyntaxFilter());
	}

	@Test
	void geometryCommandsAllowEveryNonCasCommand() {
		AppConfigGraphing config = new AppConfigGraphing().withGeometryCommands();
		CommandFilter filter = config.createCommandFilter();
		for (Commands command : GEOMETRY) {
			assertTrue(filter.isCommandAllowed(command), command.name());
		}
		// Still no CAS, as in the Geometry app.
		assertFalse(filter.isCommandAllowed(Commands.Factor));
		assertFalse(filter.isCommandAllowed(Commands.Simplify));
		assertNull(config.getCommandArgumentFilter());
		assertNull(config.newCommandSyntaxFilter());
	}

	@Test
	void dataViewsCanBeRemoved() {
		assertTrue(new AppConfigGraphing().hasTableView());
		assertTrue(new AppConfigGraphing().hasSpreadsheetView());
		AppConfigGraphing config = new AppConfigGraphing().withoutDataViews();
		assertFalse(config.hasTableView());
		assertFalse(config.hasSpreadsheetView());
	}

	@Test
	void previewPointsCanBeRemoved() {
		assertTrue(new AppConfigGraphing().hasPreviewPoints());
		assertFalse(new AppConfigGraphing().withoutPreviewPoints().hasPreviewPoints());
	}

	@Test
	void disabledCommandsAreRefusedWithTheirAliases() {
		CommandFilter filter = new AppConfigGraphing().withGeometryCommands()
				.withDisabledCommands(Commands.Intersect, Commands.Reflect, Commands.Slope)
				.createCommandFilter();
		assertFalse(filter.isCommandAllowed(Commands.Intersect));
		assertFalse(filter.isCommandAllowed(Commands.Reflect));
		// Reflect is the English alias of the internal Mirror command.
		assertFalse(filter.isCommandAllowed(Commands.Mirror));
		assertFalse(filter.isCommandAllowed(Commands.Slope));
		assertTrue(filter.isCommandAllowed(Commands.Segment));
		assertTrue(filter.isCommandAllowed(Commands.Polygon));
		// The app's own restrictions still apply.
		assertFalse(filter.isCommandAllowed(Commands.Factor));
	}
}
