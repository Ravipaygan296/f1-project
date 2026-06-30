import sys
import os

# Add root folder to python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    print("Attempting to import backend.main...")
    from backend.main import app
    print("Successfully imported FastAPI app!")
    
    # Check registered startup handlers
    startup_handlers = [h for h in app.router.on_startup]
    print(f"Registered startup handlers: {len(startup_handlers)}")
    for h in startup_handlers:
        print(f" - Startup handler: {h.__name__}")
        
    print("Verification successful! No errors found.")
except Exception as e:
    print(f"Verification FAILED with exception: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
