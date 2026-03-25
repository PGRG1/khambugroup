-- Insert new item SPI-0012
INSERT INTO product_master (internal_sku, external_sku, internal_product_name, supplier_product_name, level1_category, level2_category, level3_category, purchase_unit, purchase_unit_cost, stock_uom, stock_qty, cost_per_stock_unit, base_unit_type, base_unit_qty, cost_per_base_unit, supplier, status, notes)
VALUES ('SPI-0012', '7110001S', 'Star Anise 600g', 'Star Anise 600g', 'Food', 'Spices & Seasonings', 'Star Anise', 'Pack', 98, 'Pack', 1, 98, 'g', 600, 0.1633, 'ONGO Food Limited', 'Active', '')
ON CONFLICT (internal_sku) DO NOTHING;

-- Update all existing Ongo items with latest spreadsheet data
UPDATE product_master SET level1_category='Food', level2_category='Pasta & Noodles', level3_category='Spaghetti', supplier_product_name='(S) TGO Spaghetti (1.9mm) 500g x 24/case', purchase_unit_cost=175, stock_uom='Case', stock_qty=24, cost_per_stock_unit=7.29, base_unit_type='g', base_unit_qty=12000, cost_per_base_unit=0.0146 WHERE internal_sku='PAS-0001';

UPDATE product_master SET level1_category='Food', level2_category='Pasta & Noodles', level3_category='Linguine', supplier_product_name='Barilla Linguine 1kg x 18/case', purchase_unit='Case', purchase_unit_cost=390, stock_uom='Case', stock_qty=18, cost_per_stock_unit=21.67, base_unit_type='g', base_unit_qty=1000, cost_per_base_unit=0.39 WHERE internal_sku='PAS-0002';

UPDATE product_master SET level1_category='Food', level2_category='Pasta & Noodles', level3_category='Instant Noodles', supplier_product_name='Shin Ramyun Noodle Soup 120g x 40/case', purchase_unit_cost=225, stock_uom='Pack', stock_qty=40, cost_per_stock_unit=5.63, base_unit_type='Pack', base_unit_qty=40, cost_per_base_unit=5.625 WHERE internal_sku='DRY-0012';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Thai Rice', supplier_product_name='Star King Thai Rice 25kg/bag', purchase_unit_cost=295, stock_uom='Bag', stock_qty=1, cost_per_stock_unit=295, base_unit_type='g', base_unit_qty=25000, cost_per_base_unit=0.0118 WHERE internal_sku='DRY-0011';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Wheat Flour', supplier_product_name='American Roses Extra Sp. Wheat Flour 50lb/bag', purchase_unit_cost=270, stock_uom='Bag', stock_qty=1, cost_per_stock_unit=270, base_unit_type='g', base_unit_qty=22680, cost_per_base_unit=0.0119 WHERE internal_sku='DRY-0010';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Self Raising Flour', supplier_product_name='Kangaroo Self Raising Flour 800g/box', purchase_unit_cost=34, stock_uom='Bag', stock_qty=1, cost_per_stock_unit=34, base_unit_type='g', base_unit_qty=800, cost_per_base_unit=0.0425 WHERE internal_sku='DRY-0009';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Corn Starch', supplier_product_name='Knorr Corn Starch 420g/box', purchase_unit_cost=11.5, stock_uom='Pcs', stock_qty=1, cost_per_stock_unit=11.5, base_unit_type='g', base_unit_qty=420, cost_per_base_unit=0.0274 WHERE internal_sku='DRY-0007';

UPDATE product_master SET level1_category='Food', level2_category='Oils', level3_category='Cooking Oil', supplier_product_name='High Quality Gourmet''s Kitchen Oil 15L/tin', purchase_unit='Tin', purchase_unit_cost=225, stock_uom='Tin', stock_qty=1, cost_per_stock_unit=225, base_unit_type='ml', base_unit_qty=15000, cost_per_base_unit=0.015 WHERE internal_sku='OIL-0001';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Sugar', supplier_product_name='Korea Granulated Sugar 30kg/bag', purchase_unit_cost=255, stock_uom='Bag', stock_qty=1, cost_per_stock_unit=255, base_unit_type='g', base_unit_qty=30000, cost_per_base_unit=0.0085 WHERE internal_sku='DRY-0005';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Honey', supplier_product_name='Centifloral Honey (D.H.) 1.5kg/pail', purchase_unit_cost=98, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=98, base_unit_type='g', base_unit_qty=1500, cost_per_base_unit=0.0653 WHERE internal_sku='DRY-0004';

UPDATE product_master SET level1_category='Food', level2_category='Dessert Ingredients', level3_category='Strawberry Topping', supplier_product_name='Strawberry Topping (Btl) 1kg/bottle', purchase_unit_cost=96, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=96, base_unit_type='g', base_unit_qty=1000, cost_per_base_unit=0.096 WHERE internal_sku='TOP-0002';

UPDATE product_master SET level1_category='Food', level2_category='Dessert Ingredients', level3_category='Chocolate Topping', supplier_product_name='Chocolate Topping (Btl) 1kg/bottle', purchase_unit_cost=94, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=94, base_unit_type='g', base_unit_qty=1000, cost_per_base_unit=0.094 WHERE internal_sku='TOP-0001';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Salt', supplier_product_name='Table Salt (Box) 1lb', purchase_unit_cost=3.5, stock_uom='Box', stock_qty=1, cost_per_stock_unit=3.5, base_unit_type='g', base_unit_qty=454, cost_per_base_unit=0.0077 WHERE internal_sku='DRY-0008';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Chicken Powder', supplier_product_name='Knorr Chicken Powder 1.8kg', purchase_unit='Tub', purchase_unit_cost=116, stock_uom='Tub', stock_qty=1, cost_per_stock_unit=116, base_unit_type='g', base_unit_qty=1800, cost_per_base_unit=0.0644 WHERE internal_sku='SEA-0001';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Soy Sauce', supplier_product_name='P.R.B Superior Soy Sauce 1.8L', purchase_unit_cost=20, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=20, base_unit_type='ml', base_unit_qty=1800, cost_per_base_unit=0.0111 WHERE internal_sku='SAU-0004';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Sweet Chili Sauce', supplier_product_name='Pantai Sweet Chili Sauce 730ml', purchase_unit_cost=24.5, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=24.5, base_unit_type='ml', base_unit_qty=730, cost_per_base_unit=0.0336 WHERE internal_sku='SAU-0007';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Tomato Ketchup', supplier_product_name='Del Monte Tomato Ketchup 24oz x 12', purchase_unit='Pack', purchase_unit_cost=250, stock_uom='Bottle', stock_qty=12, cost_per_stock_unit=20.83, base_unit_type='ml', base_unit_qty=8520, cost_per_base_unit=0.0293 WHERE internal_sku='SAU-0005';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Sesame Dressing', supplier_product_name='Kewpie Roasted Sesame Dressing 1500ml', purchase_unit_cost=72, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=72, base_unit_type='ml', base_unit_qty=1500, cost_per_base_unit=0.048 WHERE internal_sku='SAU-0006';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Mayonnaise', supplier_product_name='Kraft Mayonnaise 1GL', purchase_unit='Jar', purchase_unit_cost=150, stock_uom='Jar', stock_qty=1, cost_per_stock_unit=150, base_unit_type='ml', base_unit_qty=3785, cost_per_base_unit=0.0396, notes='* how does this arrive, what is it''s quantity' WHERE internal_sku='SAU-0003';

UPDATE product_master SET level1_category='Food', level2_category='Sauces & Condiments', level3_category='Pepper Sauce', supplier_product_name='Tabasco Pepper Sauce (L) 150ml x 12', purchase_unit='Case', purchase_unit_cost=415, stock_uom='Bottle', stock_qty=12, cost_per_stock_unit=34.58, base_unit_type='ml', base_unit_qty=1800, cost_per_base_unit=0.2306 WHERE internal_sku='SAU-0008';

UPDATE product_master SET level1_category='Food', level2_category='Oils', level3_category='Truffle Oil', supplier_product_name='Black Truffle Oil, Italy 250ml', purchase_unit_cost=295, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=295, base_unit_type='ml', base_unit_qty=250, cost_per_base_unit=1.18 WHERE internal_sku='OIL-0002';

UPDATE product_master SET level1_category='Food', level2_category='Pickles, Preserves & Seeds', level3_category='Gherkins', supplier_product_name='Kuhne Sweet & Sour Gherkins 670g', purchase_unit='Jar', purchase_unit_cost=35, stock_uom='Jar', stock_qty=1, cost_per_stock_unit=35, base_unit_type='g', base_unit_qty=670, cost_per_base_unit=0.0522 WHERE internal_sku='VEG-0001';

UPDATE product_master SET level1_category='Food', level2_category='Pickles, Preserves & Seeds', level3_category='Capers', supplier_product_name='Capers In Vinegar, Italy 700g', purchase_unit='Jar', purchase_unit_cost=50, stock_uom='Jar', stock_qty=1, cost_per_stock_unit=50, base_unit_type='g', base_unit_qty=700, cost_per_base_unit=0.0714 WHERE internal_sku='VEG-0002';

UPDATE product_master SET level1_category='Food', level2_category='Pickles, Preserves & Seeds', level3_category='Capers', supplier_product_name='Castello Bottled Capers 10/11 in Vinegar 680ml', purchase_unit='Jar', purchase_unit_cost=60, stock_uom='Jar', stock_qty=1, cost_per_stock_unit=60, base_unit_type='ml', base_unit_qty=680, cost_per_base_unit=0.0882 WHERE internal_sku='VEG-0003';

UPDATE product_master SET level1_category='Food', level2_category='Pickles, Preserves & Seeds', level3_category='Sunflower Seeds', supplier_product_name='Sunflower Seeds 500g', purchase_unit_cost=45, stock_uom='Pack', stock_qty=1, cost_per_stock_unit=45, base_unit_type='g', base_unit_qty=500, cost_per_base_unit=0.09 WHERE internal_sku='DRY-0013';

UPDATE product_master SET level1_category='Food', level2_category='Rice, Flour & Dry Goods', level3_category='Black Bean', supplier_product_name='Dried Black Bean', purchase_unit='500g', purchase_unit_cost=17.5, stock_uom='g', stock_qty=500, cost_per_stock_unit=0.04, base_unit_type='g', base_unit_qty=1000, cost_per_base_unit=0.0175 WHERE internal_sku='DRY-0006';

UPDATE product_master SET level1_category='Drinks', level2_category='Alcoholic Beverages', level3_category='Brandy', supplier_product_name='Napoleon Brandy 700ml', purchase_unit_cost=85, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=85, base_unit_type='ml', base_unit_qty=700, cost_per_base_unit=0.1214 WHERE internal_sku='BEV-0109';

UPDATE product_master SET level1_category='Drinks', level2_category='Alcoholic Beverages', level3_category='Red Wine', supplier_product_name='TGO Red Wine 750ml x 6', purchase_unit='Case', purchase_unit_cost=118, stock_uom='Bottle', stock_qty=6, cost_per_stock_unit=19.67, base_unit_type='ml', base_unit_qty=750, cost_per_base_unit=0.1573 WHERE internal_sku='BEV-0107';

UPDATE product_master SET level1_category='Drinks', level2_category='Alcoholic Beverages', level3_category='White Wine', supplier_product_name='TGO White Wine 750ml x 6', purchase_unit='Case', purchase_unit_cost=118, stock_uom='Bottle', stock_qty=6, cost_per_stock_unit=19.67, base_unit_type='ml', base_unit_qty=750, cost_per_base_unit=0.1573 WHERE internal_sku='BEV-0108';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Black Pepper', supplier_product_name='KOS Black Pepper (Cracked) 500g', purchase_unit_cost=76, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=76, base_unit_type='g', base_unit_qty=500, cost_per_base_unit=0.152 WHERE internal_sku='SPI-0010';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Oregano', supplier_product_name='KOS Oregano 140g', purchase_unit='Jar', purchase_unit_cost=70, stock_uom='Jar', stock_qty=1, cost_per_stock_unit=70, base_unit_type='g', base_unit_qty=140, cost_per_base_unit=0.5 WHERE internal_sku='SPI-0013';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Paprika', supplier_product_name='KOS Paprika 450g', purchase_unit='Jar', purchase_unit_cost=78, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=78, base_unit_type='g', base_unit_qty=450, cost_per_base_unit=0.1733 WHERE internal_sku='SPI-0006';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Garlic Powder', supplier_product_name='KOS Garlic Powder 500g', purchase_unit='Jar', purchase_unit_cost=75, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=75, base_unit_type='g', base_unit_qty=500, cost_per_base_unit=0.15 WHERE internal_sku='SPI-0008';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Cajun Seasoning', supplier_product_name='McCormick Cajun Seasoning 510g', purchase_unit='Jar', purchase_unit_cost=158, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=158, base_unit_type='g', base_unit_qty=510, cost_per_base_unit=0.3098, notes='*this seems a bit expensive' WHERE internal_sku='SPI-0005';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Red Pepper Chopped', supplier_product_name='McCormick Red Pepper Chopped 368g', purchase_unit='Jar', purchase_unit_cost=107, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=107, base_unit_type='g', base_unit_qty=368, cost_per_base_unit=0.2908 WHERE internal_sku='SPI-0007';

UPDATE product_master SET level1_category='Food', level2_category='Spices & Seasonings', level3_category='Cayenne Pepper', supplier_product_name='McCormick Cayenne Pepper, Ground 396g', purchase_unit='Jar', purchase_unit_cost=109, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=109, base_unit_type='g', base_unit_qty=396, cost_per_base_unit=0.2753 WHERE internal_sku='SPI-0011';

UPDATE product_master SET level1_category='Food', level2_category='Dessert Ingredients', level3_category='Vanilla Essence', supplier_product_name='IFF Vanilla Essence 500g', purchase_unit_cost=89, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=89, base_unit_type='g', base_unit_qty=500, cost_per_base_unit=0.178 WHERE internal_sku='SPI-0009';

UPDATE product_master SET level1_category='Packaging / Service Supplies', level2_category='Kitchen Consumables', level3_category='Baking Paper', supplier_product_name='Non Stick Cooking Paper 5m x 24', purchase_unit='Roll', purchase_unit_cost=485, stock_uom='Roll', stock_qty=1, cost_per_stock_unit=485, base_unit_type='ea', base_unit_qty=24, cost_per_base_unit=20.2083 WHERE internal_sku='PKG-0003';

UPDATE product_master SET level1_category='Packaging / Service Supplies', level2_category='Service Supplies', level3_category='Paper Doyley', supplier_product_name='7.5" Paper Doyley 170pcs', purchase_unit='Pack', purchase_unit_cost=12, stock_uom='Pack', stock_qty=1, cost_per_stock_unit=12, base_unit_type='ea', base_unit_qty=170, cost_per_base_unit=0.0706 WHERE internal_sku='PKG-0004';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Cleaning Chemicals', level3_category='Detergent', supplier_product_name='Liquid Detergent 40lb', purchase_unit='Bottle', purchase_unit_cost=95, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=95, base_unit_type='g', base_unit_qty=18144, cost_per_base_unit=0.0052 WHERE internal_sku='OPS-0007';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Cleaning Chemicals', level3_category='Bleach', supplier_product_name='Bleach 40lb', purchase_unit='Bottle', purchase_unit_cost=88, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=88, base_unit_type='g', base_unit_qty=18144, cost_per_base_unit=0.0049 WHERE internal_sku='OPS-0008';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Cleaning Chemicals', level3_category='Oven Cleaner', supplier_product_name='Oven Cleaner 3.8L', purchase_unit='Bottle', purchase_unit_cost=90, stock_uom='Bottle', stock_qty=1, cost_per_stock_unit=90, base_unit_type='ml', base_unit_qty=3800, cost_per_base_unit=0.0237 WHERE internal_sku='OPS-0006';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Cleaning Consumables', level3_category='Face Towel', supplier_product_name='Face Towel - 96/dozen', purchase_unit='Pack', purchase_unit_cost=76, stock_uom='Pack', stock_qty=1, cost_per_stock_unit=76, base_unit_type='ea', base_unit_qty=1152, cost_per_base_unit=0.066 WHERE internal_sku='OPS-0010';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Protective Supplies', level3_category='Gloves', supplier_product_name='TGO Black Industrial Gloves (M)/dozen', purchase_unit='Box', purchase_unit_cost=80, stock_uom='Box', stock_qty=1, cost_per_stock_unit=80, base_unit_type='ea', base_unit_qty=1, cost_per_base_unit=80 WHERE internal_sku='OPS-0005';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Protective Supplies', level3_category='Gloves', supplier_product_name='Blue Nitrile Gloves-M 100''s', purchase_unit='Box', purchase_unit_cost=65, stock_uom='Box', stock_qty=1, cost_per_stock_unit=65, base_unit_type='ea', base_unit_qty=100, cost_per_base_unit=0.65 WHERE internal_sku='OPS-0009';

UPDATE product_master SET level1_category='Packaging / Service Supplies', level2_category='Wraps & Foils', level3_category='Film Wrap', supplier_product_name='TGO (10mic) Premium Film Wrap #912 15"', purchase_unit='Roll', purchase_unit_cost=120, stock_uom='Roll', stock_qty=1, cost_per_stock_unit=120, base_unit_type='ea', base_unit_qty=1, cost_per_base_unit=120 WHERE internal_sku='PKG-0002';

UPDATE product_master SET level1_category='Packaging / Service Supplies', level2_category='Wraps & Foils', level3_category='Aluminium Foil', supplier_product_name='TGO Aluminium Foil #613 150M 15"', purchase_unit='Roll', purchase_unit_cost=160, stock_uom='Roll', stock_qty=1, cost_per_stock_unit=160, base_unit_type='ea', base_unit_qty=1, cost_per_base_unit=160 WHERE internal_sku='PKG-0005';

UPDATE product_master SET level1_category='Cleaning / Operating Supplies', level2_category='Cleaning Consumables', level3_category='Garbage Bags', supplier_product_name='Large garbage bags 36" x 42"', purchase_unit='Pack', purchase_unit_cost=158, stock_uom='Pack', stock_qty=1, cost_per_stock_unit=158, base_unit_type='ea', base_unit_qty=1, cost_per_base_unit=158 WHERE internal_sku='OPS-0004';