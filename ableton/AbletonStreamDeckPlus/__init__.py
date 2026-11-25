from .control_surface import AbletonStreamDeckPlus


def create_instance(c_instance):
    return AbletonStreamDeckPlus(c_instance)
