# Directory Structure

```
packages/
  dockview/
    src/
      dockview/
        defaultTab.tsx (116 lines)
        dockview.tsx (328 lines)
        headerActionsRenderer.ts (100 lines)
        reactContentPart.ts (67 lines)
        reactHeaderPart.ts (58 lines)
        reactWatermarkPart.ts (62 lines)
      gridview/
        gridview.tsx (136 lines)
        view.ts (37 lines)
      paneview/
        paneview.tsx (186 lines)
        view.ts (55 lines)
      splitview/
        splitview.tsx (136 lines)
        view.ts (33 lines)
      index.ts (9 lines)
      react.ts (206 lines)
      svg.tsx (29 lines)
      types.ts (5 lines)
    package.json (61 lines)
  dockview-core/
    src/
      api/
        component.api.ts (940 lines)
        dockviewGroupPanelApi.ts (161 lines)
        dockviewPanelApi.ts (237 lines)
        entryPoints.ts (46 lines)
        gridviewPanelApi.ts (68 lines)
        panelApi.ts (188 lines)
        paneviewPanelApi.ts (55 lines)
        splitviewPanelApi.ts (65 lines)
      dnd/
        abstractDragHandler.ts (88 lines)
        dataTransfer.ts (88 lines)
        dnd.ts (109 lines)
        droptarget.ts (690 lines)
        dropTargetAnchorContainer.ts (102 lines)
        ghost.ts (21 lines)
        groupDragHandler.ts (89 lines)
      dockview/
        components/
          panel/
            content.ts (211 lines)
          tab/
            defaultTab.ts (64 lines)
            tab.ts (173 lines)
          titlebar/
            tabOverflowControl.ts (25 lines)
            tabs.ts (307 lines)
            tabsContainer.ts (414 lines)
            voidContainer.ts (92 lines)
          watermark/
            watermark.ts (26 lines)
          popupService.ts (90 lines)
        deserializer.ts (74 lines)
        dockviewComponent.ts (2900 lines)
        dockviewFloatingGroupPanel.ts (23 lines)
        dockviewGroupPanel.ts (211 lines)
        dockviewGroupPanelModel.ts (1108 lines)
        dockviewPanel.ts (284 lines)
        dockviewPanelModel.ts (120 lines)
        events.ts (63 lines)
        framework.ts (45 lines)
        options.ts (306 lines)
        strictEventsSequencing.ts (54 lines)
        theme.ts (70 lines)
        types.ts (75 lines)
        validate.ts (90 lines)
      gridview/
        baseComponentGridview.ts (398 lines)
        basePanelView.ts (154 lines)
        branchNode.ts (374 lines)
        gridview.ts (1132 lines)
        gridviewComponent.ts (457 lines)
        gridviewPanel.ts (314 lines)
        leafNode.ts (138 lines)
        options.ts (34 lines)
        types.ts (4 lines)
      overlay/
        overlay.ts (646 lines)
        overlayRenderContainer.ts (315 lines)
      panel/
        types.ts (39 lines)
      paneview/
        defaultPaneviewHeader.ts (85 lines)
        draggablePaneviewPanel.ts (190 lines)
        options.ts (56 lines)
        paneview.ts (218 lines)
        paneviewComponent.ts (502 lines)
        paneviewPanel.ts (348 lines)
      splitview/
        options.ts (43 lines)
        splitview.ts (1174 lines)
        splitviewComponent.ts (436 lines)
        splitviewPanel.ts (175 lines)
        viewItem.ts (95 lines)
      array.ts (73 lines)
      constants.ts (5 lines)
      dom.ts (500 lines)
      events.ts (287 lines)
      framwork.ts (5 lines)
      index.ts (150 lines)
      lifecycle.ts (69 lines)
      math.ts (36 lines)
      popoutWindow.ts (181 lines)
      resizable.ts (73 lines)
      scrollbar.ts (131 lines)
      svg.ts (42 lines)
      types.ts (20 lines)
    package.json (55 lines)
  docs/
    docs/
      advanced/
        advanced.mdx (6 lines)
        iframe.mdx (30 lines)
        keyboard.mdx (16 lines)
        nested.mdx (13 lines)
      api/
        dockview/
          groupApi.mdx (14 lines)
          options.mdx (23 lines)
          overview.mdx (10 lines)
          panelApi.mdx (10 lines)
        gridview/
          api.mdx (9 lines)
          options.mdx (23 lines)
          panelApi.mdx (10 lines)
        paneview/
          api.mdx (9 lines)
          options.mdx (23 lines)
          panelApi.mdx (10 lines)
        splitview/
          api.mdx (9 lines)
          options.mdx (23 lines)
          panelApi.mdx (10 lines)
      core/
        dnd/
          disable.mdx (27 lines)
          dragAndDrop.mdx (91 lines)
          external.mdx (18 lines)
          overview.mdx (39 lines)
          thirdParty.mdx (13 lines)
        groups/
          constraints.mdx (15 lines)
          controls.mdx (49 lines)
          floatingGroups.mdx (86 lines)
          hiddenHeader.mdx (12 lines)
          locked.mdx (23 lines)
          maxmizedGroups.mdx (53 lines)
          move.mdx (20 lines)
          popoutGroups.mdx (59 lines)
          resizing.mdx (36 lines)
        panels/
          add.mdx (234 lines)
          move.mdx (27 lines)
          register.mdx (166 lines)
          remove.mdx (29 lines)
          rendering.mdx (130 lines)
          resizing.mdx (40 lines)
          tabs.mdx (338 lines)
          update.mdx (45 lines)
        state/
          load.mdx (45 lines)
          save.mdx (40 lines)
        locked.mdx (17 lines)
        overview.mdx (67 lines)
        scrollbars.mdx (18 lines)
        watermark.mdx (38 lines)
      other/
        gridview/
          overview.mdx (16 lines)
        paneview/
          overview.mdx (14 lines)
        splitview/
          overview.mdx (16 lines)
        tabview.mdx (8 lines)
      overview/
        getStarted/
          contributing.mdx (53 lines)
          installation.mdx (40 lines)
          theme.mdx (101 lines)
      index.mdx (1 lines)
    sandboxes/
      dockview-app/
        src/
          app.tsx (119 lines)
          index.tsx (20 lines)
      react/
        dockview/
          constraints/
            src/
              app.tsx (148 lines)
              index.tsx (20 lines)
          demo-dockview/
            src/
              app.tsx (541 lines)
              controls.tsx (148 lines)
              debugPanel.tsx (164 lines)
              gridActions.tsx (222 lines)
              groupActions.tsx (187 lines)
              index.tsx (20 lines)
              mapboxPanel.tsx (28 lines)
              panelActions.tsx (131 lines)
              panelBuilder.tsx (115 lines)
          dnd-events/
            src/
              app.tsx (142 lines)
              index.tsx (20 lines)
          dnd-external/
            src/
              app.tsx (192 lines)
              index.tsx (20 lines)
          floating-groups/
            src/
              app.tsx (301 lines)
              index.tsx (20 lines)
              utils.tsx (30 lines)
          group-actions/
            src/
              app.tsx (102 lines)
              index.tsx (20 lines)
          layout/
            src/
              app.tsx (132 lines)
              index.tsx (20 lines)
          locked/
            src/
              app.tsx (64 lines)
              index.tsx (20 lines)
          maximize-group/
            src/
              app.tsx (252 lines)
              index.tsx (20 lines)
              utils.tsx (30 lines)
          render-mode/
            src/
              app.tsx (160 lines)
              index.tsx (20 lines)
          resize/
            src/
              app.tsx (127 lines)
              index.tsx (20 lines)
          resize-container/
            src/
              app.tsx (117 lines)
              index.tsx (20 lines)
          scrollbars/
            src/
              app.tsx (77 lines)
              index.tsx (20 lines)
          tabview/
            src/
              app.tsx (82 lines)
              index.tsx (20 lines)
          update-parameters/
            src/
              app.tsx (85 lines)
              index.tsx (20 lines)
          update-title/
            src/
              app.tsx (74 lines)
              index.tsx (20 lines)
          watermark/
            src/
              app.tsx (135 lines)
              index.tsx (20 lines)
README.md (38 lines)
```