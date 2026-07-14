-- Migration 013: Seed HRMO 2026 SP budget items

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('6d7dae77-d13c-4aca-a1ec-6ef7556aa879','HRMO','7334 - LANDSCAPING','Landscaping – Mulch Bed Elimination','',10000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('f47a90e9-0091-4be7-8f0e-34e8144692e9','HRMO','7345 - POOL','Pool Furniture Replacement','',15000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('7267d888-95b7-4f95-81ce-e49a229ca014','HRMO','7347 - ROOFING','Roof Replacements (5649 & 5633)','',75000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('1505a224-25bc-4fb5-9c3b-1c63a60057c6','HRMO','7349 - SIGNAGE','New Signage throughout community- Ours is mismatching, rotted, & confusing.','',11000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('c2db1b55-2cbc-4d08-880d-0736994cead7','HRMO','7322 - BUILDING REPAIRS','Gutter Repairs & Replacement','',12000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('fe4d1185-80e5-4711-b4f8-518bc933e027','HRMO','7430 - SIDEWALKS','Patio & Sidewalk Trip Hazard Repairs','',8000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('d90271fb-59c4-47ee-a19d-65af7eccbc46','HRMO','7334 - LANDSCAPING','Tree Trimming (2x/year)','',16000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('a5187e5f-72cf-44f3-86c3-653f3bc873b2','HRMO','7333 - ELECTRICAL EXTERIOR','Breezeway & Exterior Lighting Upgrades','',25000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('2257fba9-bf6c-4ba8-8fc1-0191f7decb2c','HRMO','7329 - FENCING','Pool Fence Repairs','',5000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('0c485de8-9933-4dab-a2c3-ecfd76fa149c','HRMO','7430 - SIDEWALK','Pool Deck Foam Jacking & Repairs','',6000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('36a6c73f-fa0b-4507-acc5-c004a668ac93','HRMO','7348 - SECURITY','Alarm and Security Cameras','',6000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('9e229bff-a151-4a69-a705-f0d4400c871b','HRMO','7322 - BUILDING REPAIRS','Siding','',50000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('37c36d54-cb43-488e-803b-3b90cc17da07','HRMO','7338 - PARKING','Asphalt Repairs & Restriping','',25000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;

INSERT INTO projects(id,property_code,category,name,description,anticipated_cost,in_house,is_budget_item,on_hold,pinned,date_added,steps) VALUES
('3fbcd2c3-7bfd-4c63-a0c9-d06a9986b029','HRMO','7334 - LANDSCAPING','Retaining wall at 5735','',5000,false,true,false,false,CURRENT_DATE,'{}') ON CONFLICT(id) DO NOTHING;


-- 14 items, total $269,000
