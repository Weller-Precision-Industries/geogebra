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

package org.geogebra.web.full.gui.view.algebra;

import org.geogebra.web.html5.gui.util.Dom;
import org.gwtproject.dom.client.Element;
import org.gwtproject.user.client.ui.TreeItem;
import org.gwtproject.user.client.ui.Widget;

/**
 * General AV item (group header or radio item)
 */
public class AVTreeItem extends TreeItem {

	/**
	 * Empty item
	 */
	public AVTreeItem() {
		super();
		removeTreeItemRole(this);
	}

	/**
	 * @param w
	 *            item content
	 */
	public AVTreeItem(Widget w) {
		super(w);
		removeTreeItemRole(this);
	}

	/**
	 * Robotutor: GWT marks each row role="treeitem", but the tree role sits on a sibling focus
	 * helper, so no row has the tree parent ARIA requires. Rows are plain containers of labelled
	 * controls, as the input row already is.
	 * @param item algebra view row
	 */
	static void removeTreeItemRole(TreeItem item) {
		if (item.getElement().getChildNodes().getItem(0) instanceof Element el) {
			el.removeAttribute("role");
			el.removeAttribute("aria-level");
		}
	}

	@Override
	public void setSelected(boolean selected) {
		super.setSelected(selected);

		Element w = Dom.querySelectorForElement(this.getElement(), ".gwt-TreeItem-selected");
		if (w != null) {
			w.getStyle().setBackgroundColor("#FFFFFF");
		}
	}
}
