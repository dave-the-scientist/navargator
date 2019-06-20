# Author:  Dave Curran
# Date:    March 2010
# Purpose: A module to easily make use of small scale multi-threading for
#            functions by thread pooling.
# Use:     Create an instance of JobQueue, optionally passing the number of
#            threads you would like managing that queue (default is 2). The
#            number may be changed at any time, in a thread-safe manner, by
#            calling setThreadCount(int). Calling setThreadCount(0)
#            will release all threads for the current queue, but will not
#            destroy the queue itself.
#          Use addJob(fxn[, (arg1, arg2...)[, callback]]) to start a task; the
#            callback function is optional, and the args list should be
#            provided as if calling fxn(arg1, arg2) normally. If no arguments
#            are passed, fxn will be called with none.
# Note:    If a function expects a single sequence of objects, the sequence
#            may need to be passed to addJob as a list, or coma'd tuple.
#            Ex: args=(1,2,3) will be unpacked and passed as three arguemnts.
#            args=[1,2,3] or args=((1,2,3),) will be passed as one argument.
# # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # # #
import sys, threading
if sys.version_info >= (3,0): # Python 3.x imports
    import queue as Queue
else:
    import Queue

class JobQueue(Queue.Queue):
    """Class to be instantiated externally."""
    def __init__(self, numThreads=2):
        Queue.Queue.__init__(self)
        self.threadCountLock = threading.Lock()
        self.threadCount = numThreads
        self._threads = []
        self.setThreadCount(numThreads)

    def setThreadCount(self, numThreads):
        """A thread-safe method to change the number of threads
        servicing the queue."""
        threadCount = self.cleanThreads()
        if numThreads < 0: return False
        elif numThreads == threadCount: return
        while numThreads > threadCount:
            t = _PooledThread(self)
            t.daemon = True
            self._threads.append(t)
            threadCount += 1
            t.start()
        while numThreads < threadCount:
            self.put((None, None, None)) #Signal to kill a thread.
            threadCount -= 1

    def getThreadCount(self):
        return self.cleanThreads()

    def addJob(self, task, args=(), callback=None):
        if not callable(task):
            return False
        if type(args) != type(()): # Ensures a single string argument isn't \
            args = (args,)         # split into a sequence of characters.
        self.put((task, args, callback))

    def cleanThreads(self):
        with self.threadCountLock:
            self._threads = [t for t in self._threads if t.isAlive()]
            self.threadCount = len(self._threads)
            return self.threadCount

    def _reportException(self, error, fxn, args):
        """Just reports the error instead of raising it, as there is no way to
        throw the exception to the addJob call that should receive it; the
        error would not have happened until after the addJob call returned."""
        sys.stderr.write("\n%s in JobQueue thread trying to call %s with arguments %s: %s\n" % (error.__class__.__name__, fxn, args, error))


class _PooledThread(threading.Thread):
    """Object that will sit and wait for a task to be put into
    its queue.  The thread itself will then call the callback.
    Designed for internal use only."""
    def __init__(self, queue):
        threading.Thread.__init__(self)
        self.__queue = queue
        self.__dying = False
    def run(self):
        while not self.__dying:
            task, args, callback = self.__queue.get()
            try:
                if not task:
                    self.__dying = True
                    self.__queue._threads.remove(self)
                else:
                    result = task(*args)
                if callable(callback):
                    task = callback
                    task(result)
            except Exception as error:
                self.__queue._reportException(error, task, args)
            finally:
                self.__queue.task_done()
