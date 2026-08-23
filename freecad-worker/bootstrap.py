"""FreeCADCmd entrypoint. Keep this file tiny — FreeCAD executes it as a macro."""
import os
import runpy

# Steal fd 1 for JSON before FreeCAD prints progress onto it.
os.environ["AGENTCAD_JSON_FD"] = str(os.dup(1))
os.dup2(2, 1)

here = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else "/workspace/freecad-worker"
runpy.run_path(os.path.join(here, "worker.py"), run_name="__main__")
