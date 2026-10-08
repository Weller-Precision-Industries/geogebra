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

package org.geogebra.web.full.gui.toolbarpanel;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.geogebra.common.euclidian.EuclidianConstants;
import org.geogebra.common.gui.AccessibilityGroup;
import org.geogebra.common.gui.SetLabels;
import org.geogebra.common.gui.toolbar.ToolBar;
import org.geogebra.common.gui.toolcategorization.ToolCategory;
import org.geogebra.common.main.App;
import org.geogebra.common.ownership.GlobalScope;
import org.geogebra.common.util.debug.Analytics;
import org.geogebra.gwtutil.NavigatorUtil;
import org.geogebra.web.full.gui.toolbar.ToolButton;
import org.geogebra.web.html5.gui.BaseWidgetFactory;
import org.geogebra.web.html5.gui.tooltip.ComponentSnackbar;
import org.geogebra.web.html5.gui.tooltip.ToolTip;
import org.geogebra.web.html5.gui.util.AriaHelper;
import org.geogebra.web.html5.gui.zoompanel.FocusableWidget;
import org.geogebra.web.html5.main.AppW;
import org.gwtproject.user.client.ui.FlowPanel;
import org.gwtproject.user.client.ui.Label;
import org.gwtproject.user.client.ui.Widget;

import elemental2.dom.DomGlobal;

/**
 * @author judit Content of tools tab of Toolbar panel.
 */
public final class Tools extends FlowPanel implements SetLabels {

	/**
	 * application
	 */
	private final AppW app;
	/**
	 * see {@link ToolsTab}
	 */
	private final ToolsTab parentTab;

	private ArrayList<CategoryPanel> categoryPanelList;

	/**
	 * @param app
	 *            application
	 * @param parentTab
	 *            see {@link ToolsTab}
	 */
	public Tools(AppW app, ToolsTab parentTab) {
		this.app = app;
		this.parentTab = parentTab;

		this.addStyleName("toolsPanel");
		buildGui();
	}

	/**
	 * Changes visual settings of selected mode.
	 *
	 * @param mode
	 *            the mode will be selected
	 */
	public void setMode(int mode) {
		if (mode == EuclidianConstants.MODE_SELECTION_LISTENER) {
			return;
		}
		for (int i = 0; i < getWidgetCount(); i++) {
			Widget w = getWidget(i);
			if (w instanceof CategoryPanel) {
				FlowPanel panelTools = ((CategoryPanel) w).getToolsPanel();
				for (int j = 0; j < panelTools.getWidgetCount(); j++) {
					boolean selected =
							(mode + "").equals(panelTools.getWidget(j).getElement().getAttribute("mode"));
					panelTools.getWidget(j).getElement().setAttribute("selected", String.valueOf(selected));
					if (keyboardTools()) {
						panelTools.getWidget(j).getElement()
								.setAttribute("aria-pressed", String.valueOf(selected));
					}
				}
			}
		}
	}

	/**
	 * @return application
	 */
	public AppW getApp() {
		return app;
	}

	/**
	 * Builds the panel of tools.
	 */
	public void buildGui() {
		// clear panel
		this.clear();
		categoryPanelList = new ArrayList<>();
		// decide if custom toolbar or not
		String def = app.getGuiManager().getCustomToolbarDefinition();
		boolean isCustomToolbar = !ToolBar.isDefaultToolbar(def);

		parentTab.isCustomToolbar = isCustomToolbar;
		// build tools panel depending on if custom or not
		if (isCustomToolbar) {
			this.addStyleName("customToolbar");
		}

		List<ToolCategory> categories = parentTab.toolCollection.getCategories();

		for (int i = 0; i < categories.size(); i++) {
			ToolCategory category = categories.get(i);
			if (!GlobalScope.isExamActive(app) || category == null || category.isAllowedInExam()) {
				CategoryPanel catPanel = new CategoryPanel(category, parentTab.toolCollection.getTools(i));
				categoryPanelList.add(catPanel);
				add(catPanel);
			}
		}
		if (keyboardTools()) {
			// Robotutor: the tool buttons join the applet's keyboard order.
			List<Widget> buttons = new ArrayList<>();
			for (CategoryPanel panel : categoryPanelList) {
				buttons.addAll(panel.toolButtonList);
			}
			new FocusableWidget(AccessibilityGroup.TOOLS, null, buttons).attachTo(app);
		}
	}

	private boolean keyboardTools() {
		return app.getAppletParameters().getDataParamKeyboardTools();
	}

	@Override
	public void setLabels() {
		if (categoryPanelList != null && !categoryPanelList.isEmpty()) {
			for (CategoryPanel categoryPanel : categoryPanelList) {
				categoryPanel.setLabels();
			}
		}
	}

	private class CategoryPanel extends FlowPanel implements SetLabels {

		private final ToolCategory category;
		private final List<Integer> tools;

		private FlowPanel toolsPanel;
		private Label categoryLabel;
		private ArrayList<ToolButton> toolButtonList;

		CategoryPanel(ToolCategory category, List<Integer> tools) {
			super();
			this.category = category;
			this.tools = tools;
			initGui();
		}

		private void addToolButton(Integer mode) {
			ToolButton btn = getToolButton(mode);
			toolButtonList.add(btn);
			toolsPanel.add(btn);
		}

		private void initGui() {
			if (category != null) {
				categoryLabel = BaseWidgetFactory.INSTANCE.newPrimaryText(
						category.getLocalizedHeader(app.getLocalization()), "catLabel");
				add(categoryLabel);
				AriaHelper.hide(categoryLabel);
			}

			toolsPanel = new FlowPanel();
			toolsPanel.addStyleName("categoryPanel");
			toolButtonList = new ArrayList<>();
			for (Integer tool : tools) {
				addToolButton(tool);
			}
			add(toolsPanel);
		}

		FlowPanel getToolsPanel() {
			return toolsPanel;
		}

		private ToolButton getToolButton(final int mode) {
			final ToolButton btn = new ToolButton(mode, getApp());
			if (keyboardTools()) {
				btn.getElement().setAttribute("aria-pressed", "false");
			} else {
				AriaHelper.hide(btn);
			}
			btn.addFastClickHandler(source -> {
				App app = getApp();
				app.setMode(mode);
				if (keyboardTools()) {
					// Robotutor: say which tool is active and what it needs, then how to click.
					// (the graph cursor adds how to click once focus reaches it)
					getApp().getActiveEuclidianView().getScreenReader().readText(
							app.getToolName(mode) + ". " + app.getToolHelp(mode));
				}
				showTooltip(mode);
				app.updateDynamicStyleBars();
				Analytics.logToolSelected(app.getInternalToolName(mode));
			});
			return btn;
		}

		@Override
		public void setLabels() {
			// update label of category header
			if (categoryLabel != null) {
				categoryLabel.setText(category.getLocalizedHeader(app.getLocalization()));
			}
			// update tooltips of tools
			for (ToolButton toolButton : toolButtonList) {
				toolButton.setLabel();
			}
		}
	}

	private boolean allowTooltips() {
		// allow tooltips for iPad
		boolean isIpad = DomGlobal.navigator.userAgent.toLowerCase(Locale.ROOT).contains("ipad");
		return (!NavigatorUtil.isMobile() || isIpad) && app.showToolBarHelp();
	}

	/**
	 * @param mode
	 *            mode number
	 */
	public void showTooltip(int mode) {
		if (allowTooltips()) {
			app.getToolTipManager().setBlockToolTip(false);
			app.getToolTipManager()
					.showBottomInfoToolTip(
							new ToolTip(
									app.getToolName(mode),
									app.getToolHelp(mode),
									"Help",
									app.getGuiManager().getTooltipURL(mode)),
							app,
							ComponentSnackbar.TOOL_TOOLTIP_DURATION);
			app.getToolTipManager().setBlockToolTip(true);
		}
	}
}
