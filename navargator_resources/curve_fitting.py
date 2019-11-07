import numpy as np
from scipy.optimize import curve_fit

def sigmoid_fxn(x, a, b, r):
    # a is (x_value where curve is at 50%) * b; b is the slope; and r is the max y_value of the curve
    # It's been constrained that the lower y_bound is 0.
    return r/2.0 * ((a-b*x) / np.sqrt((a-b*x)**2 + 1) + 1)

def initial_sigmoid_params(x, y):
    # If I offer the user the choice to input the x_value at 50% y, then a = x_mid * b
    b = 7.0 / max(x)
    a = (max(x) + min(x))/2.0 * b
    r = max(y)
    return [a, b, r]

def fit_to_sigmoid(x, y):
    init_params = initial_sigmoid_params(x, y)
    opt_params, cov = curve_fit(sigmoid_fxn, xdata=x, ydata=y, p0=init_params)
    return opt_params
