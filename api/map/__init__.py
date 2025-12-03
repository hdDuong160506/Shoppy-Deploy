from flask import Blueprint

# Định nghĩa Blueprint 'map_bp'
# static_folder='../../static': Trỏ ngược ra thư mục static chung của project
# url_prefix='/map': Mọi đường dẫn của module này sẽ bắt đầu bằng /map
map_bp = Blueprint(
    'map_bp', 
    __name__, 
    static_folder='../../static',
    template_folder='../../static'
)

# Import routes để gắn logic vào Blueprint này
from . import routes