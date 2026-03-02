use std::alloc::{GlobalAlloc, Layout, System};
use std::sync::atomic::{AtomicBool, Ordering};

pub struct StrictAllocator;

static HOT_PATH_LOCKED: AtomicBool = AtomicBool::new(false);

pub struct HotPathGuard;

impl StrictAllocator {
    pub fn lock() {
        Self::lock_hot_path();
    }

    pub fn unlock() {
        Self::unlock_hot_path();
    }

    pub fn lock_hot_path() {
        HOT_PATH_LOCKED.store(true, Ordering::SeqCst);
    }

    pub fn unlock_hot_path() {
        HOT_PATH_LOCKED.store(false, Ordering::SeqCst);
    }

    pub fn hot_path_guard() -> HotPathGuard {
        Self::lock_hot_path();
        HotPathGuard
    }
}

impl Drop for HotPathGuard {
    fn drop(&mut self) {
        StrictAllocator::unlock_hot_path();
    }
}

unsafe impl GlobalAlloc for StrictAllocator {
    unsafe fn alloc(&self, layout: Layout) -> *mut u8 {
        if HOT_PATH_LOCKED.load(Ordering::SeqCst) {
            let _ = layout;
            panic!("Hot-path allocation detected");
        }
        System.alloc(layout)
    }

    unsafe fn dealloc(&self, ptr: *mut u8, layout: Layout) {
        if HOT_PATH_LOCKED.load(Ordering::SeqCst) {
            let _ = (ptr, layout);
            panic!("Hot-path deallocation detected");
        }
        System.dealloc(ptr, layout)
    }
}

#[global_allocator]
static GLOBAL_ALLOCATOR: StrictAllocator = StrictAllocator;
