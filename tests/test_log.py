import logging

root = logging.getLogger()
print("Root handlers:", root.handlers)

app_logger = logging.getLogger("backend")
print("App logger handlers:", app_logger.handlers)
print("App logger propagate:", app_logger.propagate)
