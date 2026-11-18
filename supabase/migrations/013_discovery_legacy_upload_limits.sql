-- Restrict the existing private legacy-manual bucket to reasonably sized uploads.
update storage.buckets set file_size_limit = 8388608 where id = 'discovery-legacy';
