# # #  Errors used by NaVARgator
class NavargatorError(Exception):
    """Base class for errors originating from this software."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: unspecified problem in NaVARgator"
        super(NavargatorError, self).__init__(msg)

class NavargatorValidationError(NavargatorError):
    """Error indicating a data validation check was failed."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: NaVARgator validation error"
        super(NavargatorValidationError, self).__init__(msg)

class NavargatorValueError(NavargatorError):
    """Error indicating an inappropriate value was passed."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: NaVARgator value error"
        super(NavargatorValueError, self).__init__(msg)

class NavargatorRuntimeError(NavargatorError):
    """Error indicating something bad happened during run time."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "Error: NaVARgator runtime error"
        super(NavargatorRuntimeError, self).__init__(msg)

class NavargatorCapacityError(NavargatorError):
    """Error indicating the server is over capacity as defined by the max_sessions attribute of the NavargatorDaemon class."""
    def __init__(self, msg=None):
        if msg == None:
            msg = "unable to create a new NaVARgator session as the server is currently over capacity. Please try again at a later time. If the problem persists, please contact the webmaster."
        super(NavargatorCapacityError, self).__init__(msg)
