

## Remove Tabs Bar from Procurement Page

Since navigation is now handled by the sidebar, the internal tabs bar at the top of the Procurement page is redundant. The plan is to remove the `TabsList` (the visible tab strip) while keeping the `Tabs` + `TabsContent` wrappers so the `defaultTab` prop still controls which content renders.

### Changes

**`src/pages/Procurement.tsx`**
- Remove the entire `<TabsList>` block (lines 31-56) containing all 8 `TabsTrigger` elements
- Remove unused icon imports (`Package`, `FileSpreadsheet`, `FileText`, `ClipboardList`, `UtensilsCrossed`, `LayoutDashboard`, `Building2`, `FolderDown`)
- Remove `onValueChange={setActiveTab}` from `<Tabs>` since users won't change tabs from within the page
- Keep `<Tabs value={activeTab}>` and all `<TabsContent>` blocks so routing still works
- Add a dynamic page title based on `defaultTab` (e.g. "Suppliers", "Product Master") instead of the generic "Procurement" heading, so users know which sub-page they're on

### Result
Each Procurement sub-page shows only its content with a contextual title — no duplicate navigation. Clean and professional.

