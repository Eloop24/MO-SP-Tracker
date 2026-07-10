-- 005_wvmo_budget_items.sql
-- Seed 2026 budget items for WVMO from budget planning spreadsheet
-- Uses INSERT ... ON CONFLICT DO NOTHING so safe to re-run

INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('bb644402-5eb9-4b40-85e7-56a555f20a1a', 'WVMO', '7322 - SP BUILDING REPAIRS', 'Deck Repairs', 'June ''24', 20000.0, 'Pending NWI sched. | $5140 approved on 6/7 for building 931. Emailed 6/15 for schedule.', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('10117f84-31ff-4b2b-8c9c-bdb566851f01', 'WVMO', '7334-SP Landscaping', 'Tree trimming/Rml of Dead Trees', 'May ''24', 10000.0, 'Pending Revised Prop. | $16,500.00 Total: $8750 now and $7750 Fall. Pending revised proposal. Will have 6/15', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('22aa6995-b149-455c-b364-58725544969c', 'WVMO', '7334-SP Landscaping', 'Mulch bed elimination', 'May ''24', 20000.0, 'done in 2025', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('e1f4656e-a17b-4f6d-b182-48500b9c8994', 'WVMO', '7334-SP Landscaping', 'Foliage to beautify community', 'March/April ''25', 10000.0, 'Pending Ben''s Approval | $5590 Total: $2630 Island, $2960 Trees', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('90bee722-5f8e-4255-b11b-35b2a86da290', 'WVMO', '7430 - SP SIDEWALKS', 'Concrete Repairs', 'May ''24', 8000.0, 'Pending NWI sched. | $10,085.00 Total: stairs at DP, 941 remove wooden steps and replace w concrete, 931 back sidewalk and drainage.', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('8de979e9-cfff-404b-a211-2f62706491f9', 'WVMO', '6919- Garage Door Contractor', 'Shop Garage Door Repair/Replace', '', 1500.0, 'done', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('16c1b277-824b-40a5-9694-8531dbfbe072', 'WVMO', '7355 SP Remodel', 'Model 921-007 Furniture needed.', '', 12000.0, 'In Progress | 99% complete. Just needing small additional décor.', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('fcbc2db6-37c5-45c1-944e-6bdb9ed1bf21', 'WVMO', '7345 SP Pool', 'Pool Repairs', 'March/April ''25', 5000.0, 'Move to 2027', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('4de13189-dd1a-4074-9319-6d171ed29346', 'WVMO', '7385 - SP COMMON AREA UPGRADES', 'School bus stop', 'March/April ''25', 5000.0, '', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('08acfbe7-a08d-4cfc-a744-c060ee425d6e', 'WVMO', '7385 - SP COMMON AREA UPGRADES', 'Convert Racquet Ball Ct to Pickle Ball.', 'Sept. ''24', 10000.0, 'Pending Supplier | Followed up on ETA 6/15. They have not received reply from supplier. Electrical material/labor . 30Lx15w Pickle ball court size', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;
INSERT INTO projects (id, property_code, category, name, description, anticipated_cost, notes, steps, date_added)
  VALUES ('0be24236-d6af-4f6a-b8d0-a6a70233ad19', 'WVMO', 'GENERAL', 'Asphalt repairs', '', 5000.0, '', '{}', CURRENT_DATE)
  ON CONFLICT (id) DO NOTHING;