-- Create the supplier
INSERT INTO suppliers (name, contact_person, payment_terms, is_active)
VALUES ('Global Fine Foods Limited', NULL, 'COD', true)
ON CONFLICT DO NOTHING;

-- Insert products into product_master
INSERT INTO product_master (internal_sku, external_sku, internal_product_name, supplier_product_name, level1_category, level2_category, level3_category, unit, unit_cost, supplier, status) VALUES
('FRZ-0001', 'GYMR1150U', 'Flour Tortilla 6"', 'USA/FZ/MI Rancho/Press Flour Tortilla/6" [12 X 24CT]', 'Bread & Wraps', 'Tortillas & Taco Shells', 'Flour Tortilla', 'CASE', 490.00, 'Global Fine Foods Limited', 'Active'),
('FRZ-0002', 'GYMR1744U', 'Corn Taco 6"', 'USA/FZ/MI Rancho/White Corn Taco/6" [6 X 10DZ]', 'Bread & Wraps', 'Tortillas & Taco Shells', 'Corn Taco Shell', 'CASE', 600.00, 'Global Fine Foods Limited', 'Active'),
('PRO-0001', 'PCGS2819', 'Chicken Wings Mid-Join', 'CHN/Global Supreme/IQF Extra Tender Chicken Wings Mid-Join [4 x 2.5kg]', 'Meat & Poultry', 'Chicken', 'Wings', 'CASE', 660.00, 'Global Fine Foods Limited', 'Active'),
('DAI-0001', 'DYCK0084U', 'Shredded Jack & Cheddar', 'USA/Chilled Cheswick, Shredded Jack & Orange Cheddar 50/50(4) [4 X 5 LB #2902]', 'Dairy', 'Cheese', 'Shredded Cheese', 'PACK', 205.00, 'Global Fine Foods Limited', 'Active'),
('SPE-0001', 'GYLR0429', 'Black Truffle Pate', 'ITA/La Rustichella Black Truffle Pate 500g(6) [6 X 500 G]', 'Sauces, Condiments & Pastes', 'Specialty Pastes', 'Truffle Pate', 'BOT', 400.00, 'Global Fine Foods Limited', 'Active'),
('PRO-0002', 'PCGS2815', 'Chicken Breast 170g', 'CHN/Global Supreme/IQF Extra Tender Chicken Breast 170g Bone [2 x 2.5kg]', 'Meat & Poultry', 'Chicken', 'Breast', 'CASE', 222.50, 'Global Fine Foods Limited', 'Active'),
('FRZ-0003', 'GYMR0389U', 'Flour Tortilla 10"', 'USA/FZ/MI Rancho/Flour Tortilla/10" [6 X 20CT]', 'Bread & Wraps', 'Tortillas & Taco Shells', 'Flour Tortilla', 'CASE', 445.00, 'Global Fine Foods Limited', 'Active'),
('SAU-0001', 'DGKF0185', 'Buttermilk Ranch Dressing', 'USA/Chilled Ken''s Dressing, Buttermilk Ranch(4) [4 X 1 GAL #0889]', 'Sauces, Condiments & Pastes', 'Dressings', 'Ranch Dressing', 'JAR', 245.00, 'Global Fine Foods Limited', 'Active'),
('FRZ-0004', 'GYMR1776U', 'Yellow Corn Thick Tortillas 6"', 'USA/FZ/MI Rancho/Yellow Corn Thick Tortillas/6" [6 X 5DZ]', 'Bread & Wraps', 'Tortillas & Taco Shells', 'Thick Corn Tortilla', 'CASE', 480.00, 'Global Fine Foods Limited', 'Active');