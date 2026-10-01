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

package org.geogebra.web.linker;

import com.google.gwt.core.ext.LinkerContext;
import com.google.gwt.core.ext.linker.Shardable;
import com.google.gwt.core.linker.CrossSiteIframeLinker;

/**
 * Robotutor fork: installs the compiled code in the host window itself, with
 * plain script tags, instead of in a hidden iframe.
 *
 * <p>For pages that run the app inside {@code <iframe sandbox="allow-scripts">}
 * (opaque origin): there the default linker's nested install iframe is a
 * separate opaque origin the bootstrap cannot reach, and inline-installed code
 * would need CSP {@code 'unsafe-inline'}. The host page must be dedicated to one
 * GeoGebra module, since there is no iframe variable isolation.</p>
 */
@Shardable
public class MainWindowLinker extends CrossSiteIframeLinker {

	@Override
	protected String getJsInstallLocation(LinkerContext context) {
		return "org/geogebra/web/linker/installLocationMainWindow.js";
	}

	@Override
	protected boolean shouldInstallCode(LinkerContext context) {
		return false;
	}
}
