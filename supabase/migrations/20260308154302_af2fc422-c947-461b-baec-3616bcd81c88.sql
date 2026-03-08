-- Update employment types to match the provided list
-- Anish Gurung: full_time -> part_time
UPDATE public.hr_employees SET employment_type = 'part_time' WHERE id = '1439d6fb-b96b-44dd-9e4a-8bc62df3c062';
-- Carlton: full_time -> part_time
UPDATE public.hr_employees SET employment_type = 'part_time' WHERE id = '56a7f052-ad84-46fd-98bc-fc28537492c1';
-- Mirak Limbu: part_time -> full_time
UPDATE public.hr_employees SET employment_type = 'full_time' WHERE id = '981d6628-dc6b-4b88-800c-8eaa6c90a935';
-- Palden: full_time -> part_time
UPDATE public.hr_employees SET employment_type = 'part_time' WHERE id = '3f847050-8021-4834-9537-e15b0f551889';
-- Stuti Limbu: full_time -> part_time
UPDATE public.hr_employees SET employment_type = 'part_time' WHERE id = '669d16fd-1162-4ab5-af25-6e552ba5df06';
-- Subash Limbu: full_time -> part_time
UPDATE public.hr_employees SET employment_type = 'part_time' WHERE id = '5c311775-f69d-4620-aa0c-090dad705518';
-- Cleaner: full_time -> part_time, job_title = '0' per list
UPDATE public.hr_employees SET employment_type = 'part_time', job_title = '0' WHERE id = '20c7cade-9738-4e3c-8702-48136e228b7f';