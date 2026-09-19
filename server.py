import os
import sys

# Launcher script: run backend/server.py seamlessly from root folder
if __name__ == '__main__':
    backend_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
    sys.path.insert(0, backend_dir)
    import server
    server.run_server()
