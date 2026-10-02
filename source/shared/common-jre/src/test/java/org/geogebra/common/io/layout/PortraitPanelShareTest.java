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

package org.geogebra.common.io.layout;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.geogebra.common.awt.AwtFactory;
import org.geogebra.common.factories.AwtFactoryCommon;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/** Robotutor fork: a share of the height for the portrait panel of an embedded applet. */
class PortraitPanelShareTest {

	@BeforeAll
	static void setUpAwt() {
		AwtFactory.setPrototypeIfNull(new AwtFactoryCommon());
	}

	@Test
	void defaultKeepsFiveInputRows() {
		assertEquals(1 - 400.0 / 560, PerspectiveDecoder.portraitRatio(560, true, 0), 1e-9);
		assertEquals(PerspectiveDecoder.portraitRatio(800, true),
				PerspectiveDecoder.portraitRatio(800, true, 0), 1e-9);
	}

	@Test
	void shareGivesThePanelThatFractionOfTheHeight() {
		assertEquals(0.65, PerspectiveDecoder.portraitRatio(560, true, 0.35), 1e-9);
	}

	@Test
	void outOfRangeSharesAreIgnored() {
		double fallback = PerspectiveDecoder.portraitRatio(560, true);
		assertEquals(fallback, PerspectiveDecoder.portraitRatio(560, true, 1), 1e-9);
		assertEquals(fallback, PerspectiveDecoder.portraitRatio(560, true, -0.5), 1e-9);
	}
}
