-- Adding an item in Bani chat takes its group (cost of sales, operating expense…) from Bani's master list for the
-- category's Level 1. The master list holds only category names and default groups, so every signed-in person may read it;
-- writes stay with platform admins (save_master_category).
DROP POLICY IF EXISTS "category master readable by signed-in" ON public.category_master;
CREATE POLICY "category master readable by signed-in" ON public.category_master FOR SELECT TO authenticated USING (true);
