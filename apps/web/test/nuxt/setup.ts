import { enableAutoUnmount } from '@vue/test-utils';
import { afterEach } from 'vitest';

// mountSuspended never unmounts: a page left mounted keeps following the shared router,
// so each later test in the file would render it again and the file would slow down
// test after test until one times out
enableAutoUnmount(afterEach);
